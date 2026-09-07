'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAdmin, AuthError } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/server';
import { audit } from '@/lib/audit';
import { buildStoragePath } from '@/lib/media';

/**
 * Admin write path.
 *
 * These are the ONLY places a post comes into existence. Every one begins with
 * requireAdmin(), which checks a table `authenticated` holds no grant on, then
 * writes with the secret key. A member's own token cannot reach any of this —
 * not because these functions guard it, but because the grants do.
 */

export type AdminState = { error?: string; ok?: boolean };

const legSchema = z.object({
  selection: z.string().trim().min(1).max(200),
  market: z.string().trim().max(120).default(''),
  odds: z.string().trim().max(20).default(''),
  units: z.coerce.number().min(0).max(100).nullable().catch(null),
});

const postSchema = z.object({
  kind: z.enum(['slip', 'text']),
  betType: z.enum(['single', 'parlay', 'prop', 'total', 'futures', 'live']),
  title: z.string().trim().max(120).default(''),
  caption: z.string().trim().max(2000).default(''),
  minTermDays: z.coerce.number().int().min(0).max(365).default(0),
  pinned: z.boolean().default(false),
  publish: z.boolean().default(true),
  legs: z.array(legSchema).max(12).default([]),
});

export async function createPost(_prev: AdminState, formData: FormData): Promise<AdminState> {
  let postId: string;

  try {
    const admin = await requireAdmin();

    // Legs arrive as parallel indexed fields; rebuild them before validating.
    const legs: unknown[] = [];
    for (let i = 0; formData.has(`leg-${i}-selection`); i++) {
      const selection = String(formData.get(`leg-${i}-selection`) ?? '').trim();
      if (!selection) continue;
      legs.push({
        selection,
        market: String(formData.get(`leg-${i}-market`) ?? ''),
        odds: String(formData.get(`leg-${i}-odds`) ?? ''),
        units: formData.get(`leg-${i}-units`) || null,
      });
    }

    const parsed = postSchema.safeParse({
      kind: formData.get('kind'),
      betType: formData.get('betType'),
      title: formData.get('title') ?? '',
      caption: formData.get('caption') ?? '',
      minTermDays: formData.get('minTermDays') ?? 0,
      pinned: formData.get('pinned') === 'on',
      publish: formData.get('publish') !== 'draft',
      legs,
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Check the form.' };
    }

    const data = parsed.data;
    if (data.kind === 'text' && data.legs.length === 0) {
      return { error: 'A text pick needs at least one selection.' };
    }

    const db = createAdminClient();
    const { data: post, error } = await db
      .from('posts')
      .insert({
        kind: data.kind,
        bet_type: data.betType,
        status: data.publish ? 'published' : 'draft',
        title: data.title,
        caption: data.caption,
        min_term_days: data.minTermDays,
        published_at: data.publish ? new Date().toISOString() : null,
        pinned_until: data.pinned ? new Date(Date.now() + 6 * 3600_000).toISOString() : null,
        created_by: admin.id,
      })
      .select('id')
      .single();

    if (error || !post) {
      console.error('[admin] post insert failed', error);
      return { error: 'Could not save the post.' };
    }

    postId = post.id;

    if (data.legs.length) {
      const { error: legErr } = await db.from('post_legs').insert(
        data.legs.map((l, i) => ({
          post_id: post.id,
          position: i,
          selection: l.selection,
          market: l.market,
          odds: l.odds,
          units: l.units,
        })),
      );
      if (legErr) {
        // Roll the post back rather than publishing a pick with no selections.
        await db.from('posts').delete().eq('id', post.id);
        return { error: 'Could not save the selections.' };
      }
    }

    await audit(data.publish ? 'admin.post.publish' : 'admin.post.create', {
      actorId: admin.id,
      entity: 'post',
      entityId: post.id,
      metadata: { kind: data.kind, betType: data.betType, minTermDays: data.minTermDays },
    });

    revalidatePath('/feed');
    revalidatePath('/admin');
  } catch (err) {
    if (err instanceof AuthError) return { error: 'Not found.' };
    console.error('[admin] createPost', err);
    return { error: 'Something went wrong.' };
  }

  // Slip posts continue to the upload step; text picks are complete.
  redirect(`/admin/posts/${postId}`);
}

const uploadSchema = z.object({
  postId: z.uuid(),
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  bytes: z.number().int().positive().max(10 * 1024 * 1024),
});

/**
 * Stores a slip screenshot in the private bucket.
 *
 * The file is validated by declared type AND by magic bytes — a client can
 * claim any content type it likes, and the bucket's allowed_mime_types check
 * trusts what it is told.
 */
export async function uploadSlip(formData: FormData): Promise<AdminState> {
  try {
    const admin = await requireAdmin();

    const file = formData.get('file');
    const rawPostId = String(formData.get('postId') ?? '');
    if (!(file instanceof File)) return { error: 'No file received.' };

    const parsed = uploadSchema.safeParse({
      postId: rawPostId,
      mime: file.type,
      bytes: file.size,
    });
    if (!parsed.success) {
      return { error: 'That file must be a PNG, JPEG or WebP under 10 MB.' };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!looksLikeImage(buffer, parsed.data.mime)) {
      return { error: 'That file does not look like a real image.' };
    }

    const db = createAdminClient();
    const ext = parsed.data.mime === 'image/png' ? 'png' : parsed.data.mime === 'image/webp' ? 'webp' : 'jpg';
    const path = buildStoragePath(parsed.data.postId, ext);

    const { error: upErr } = await db.storage
      .from('slips')
      .upload(path, buffer, { contentType: parsed.data.mime, upsert: false });

    if (upErr) {
      console.error('[admin] upload failed', upErr);
      return { error: 'Upload failed.' };
    }

    const { error: rowErr } = await db.from('post_media').insert({
      post_id: parsed.data.postId,
      storage_path: path,
      mime_type: parsed.data.mime,
      byte_size: parsed.data.bytes,
    });

    if (rowErr) {
      // Do not leave an orphan object sitting in the bucket.
      await db.storage.from('slips').remove([path]);
      return { error: 'Could not attach the image.' };
    }

    await audit('admin.media.upload', {
      actorId: admin.id,
      entity: 'post',
      entityId: parsed.data.postId,
      metadata: { bytes: parsed.data.bytes, mime: parsed.data.mime },
    });

    revalidatePath('/feed');
    revalidatePath(`/admin/posts/${parsed.data.postId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthError) return { error: 'Not found.' };
    console.error('[admin] uploadSlip', err);
    return { error: 'Something went wrong.' };
  }
}

export async function deletePost(id: string): Promise<AdminState> {
  try {
    const admin = await requireAdmin();
    const parsed = z.uuid().safeParse(id);
    if (!parsed.success) return { error: 'Unknown post.' };

    const db = createAdminClient();

    // Remove the stored objects first; the cascade would drop the rows and
    // strand the files.
    const { data: media } = await db
      .from('post_media')
      .select('storage_path')
      .eq('post_id', parsed.data);

    if (media?.length) {
      await db.storage.from('slips').remove(media.map((m) => m.storage_path));
    }

    const { error } = await db.from('posts').delete().eq('id', parsed.data);
    if (error) return { error: 'Could not delete that post.' };

    await audit('admin.post.delete', {
      actorId: admin.id,
      entity: 'post',
      entityId: parsed.data,
    });

    revalidatePath('/feed');
    revalidatePath('/admin');
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthError) return { error: 'Not found.' };
    return { error: 'Something went wrong.' };
  }
}

/** Magic-byte sniffing. A declared content type is a claim, not evidence. */
function looksLikeImage(buf: Buffer, mime: string): boolean {
  if (buf.length < 12) return false;
  if (mime === 'image/png') {
    return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  }
  if (mime === 'image/jpeg') {
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (mime === 'image/webp') {
    return buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}
