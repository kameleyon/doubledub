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

const BUCKET = 'slips';
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const;

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

/** Legs arrive as parallel indexed fields; rebuild them before validating. */
function readLegs(formData: FormData): unknown[] {
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
  return legs;
}

function parsePost(formData: FormData) {
  return postSchema.safeParse({
    kind: formData.get('kind'),
    betType: formData.get('betType'),
    title: formData.get('title') ?? '',
    caption: formData.get('caption') ?? '',
    minTermDays: formData.get('minTermDays') ?? 0,
    pinned: formData.get('pinned') === 'on',
    publish: formData.get('publish') !== 'draft',
    legs: readLegs(formData),
  });
}

/** Magic-byte sniffing. A declared content type is a claim, not evidence. */
function looksLikeImage(buf: Buffer, mime: string): boolean {
  if (buf.length < 12) return false;
  if (mime === 'image/png') return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (mime === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === 'image/webp')
    return buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

/**
 * Stores one slip image against a post.
 *
 * Returns the storage path so the caller can clean it up if a later step fails
 * — an orphaned object in a private bucket is invisible and never collected.
 */
async function attachImage(postId: string, file: File): Promise<{ path: string } | { error: string }> {
  if (!ALLOWED_MIME.includes(file.type as (typeof ALLOWED_MIME)[number])) {
    return { error: 'The slip must be a PNG, JPEG or WebP.' };
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return { error: 'That image is too large (10 MB max).' };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!looksLikeImage(buffer, file.type)) {
    return { error: 'That file does not look like a real image.' };
  }

  const db = createAdminClient();
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = buildStoragePath(postId, ext);

  const { error: upErr } = await db.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (upErr) {
    console.error('[admin] upload failed', upErr);
    return { error: 'Upload failed.' };
  }

  const { error: rowErr } = await db.from('post_media').insert({
    post_id: postId,
    storage_path: path,
    mime_type: file.type,
    byte_size: file.size,
  });

  if (rowErr) {
    await db.storage.from(BUCKET).remove([path]);
    return { error: 'Could not attach the image.' };
  }

  return { path };
}

/**
 * Creates a post, image and all, in one submission.
 *
 * Previously a slip post was created empty and then had its screenshot attached
 * on a second screen, which meant a half-finished post could sit published with
 * nothing to look at. Now the image rides along and the whole thing is rolled
 * back if any part fails.
 */
export async function createPost(_prev: AdminState, formData: FormData): Promise<AdminState> {
  try {
    const admin = await requireAdmin();

    const parsed = parsePost(formData);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Check the form.' };
    }

    const data = parsed.data;
    const file = formData.get('slip');
    const hasFile = file instanceof File && file.size > 0;

    if (data.kind === 'text' && data.legs.length === 0) {
      return { error: 'A text pick needs at least one selection.' };
    }
    if (data.kind === 'slip' && !hasFile) {
      return { error: 'Add the slip screenshot before publishing.' };
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
        await db.from('posts').delete().eq('id', post.id);
        return { error: 'Could not save the selections.' };
      }
    }

    if (hasFile) {
      const result = await attachImage(post.id, file);
      if ('error' in result) {
        // No half-published slip posts: drop the row rather than leave a card
        // with nothing in it.
        await db.from('posts').delete().eq('id', post.id);
        return { error: result.error };
      }
    }

    await audit(data.publish ? 'admin.post.publish' : 'admin.post.create', {
      actorId: admin.id,
      entity: 'post',
      entityId: post.id,
      metadata: { kind: data.kind, betType: data.betType, minTermDays: data.minTermDays },
    });
  } catch (err) {
    if (err instanceof AuthError) return { error: 'Not found.' };
    console.error('[admin] createPost', err);
    return { error: 'Something went wrong.' };
  }

  revalidatePath('/feed');
  revalidatePath('/admin');
  redirect('/admin?created=1');
}

/** Edits an existing post. Legs are replaced wholesale — simpler than diffing. */
export async function updatePost(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const id = String(formData.get('postId') ?? '');

  try {
    const admin = await requireAdmin();
    if (!z.uuid().safeParse(id).success) return { error: 'Unknown post.' };

    const parsed = parsePost(formData);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Check the form.' };
    }
    const data = parsed.data;
    if (data.kind === 'text' && data.legs.length === 0) {
      return { error: 'A text pick needs at least one selection.' };
    }

    const db = createAdminClient();
    const { data: existing } = await db.from('posts').select('status, published_at').eq('id', id).maybeSingle();
    if (!existing) return { error: 'That post no longer exists.' };

    const { error } = await db
      .from('posts')
      .update({
        bet_type: data.betType,
        title: data.title,
        caption: data.caption,
        min_term_days: data.minTermDays,
        status: data.publish ? 'published' : 'draft',
        // Keep the original publication time on an edit; re-dating a post would
        // shuffle it back to the top of everyone's feed.
        published_at: data.publish ? (existing.published_at ?? new Date().toISOString()) : null,
        pinned_until: data.pinned ? new Date(Date.now() + 6 * 3600_000).toISOString() : null,
      })
      .eq('id', id);

    if (error) return { error: 'Could not save your changes.' };

    await db.from('post_legs').delete().eq('post_id', id);
    if (data.legs.length) {
      await db.from('post_legs').insert(
        data.legs.map((l, i) => ({
          post_id: id,
          position: i,
          selection: l.selection,
          market: l.market,
          odds: l.odds,
          units: l.units,
        })),
      );
    }

    const file = formData.get('slip');
    if (file instanceof File && file.size > 0) {
      const { data: old } = await db.from('post_media').select('storage_path').eq('post_id', id);
      const result = await attachImage(id, file);
      if ('error' in result) return { error: result.error };
      if (old?.length) {
        await db.storage.from(BUCKET).remove(old.map((m) => m.storage_path));
        await db.from('post_media').delete().eq('post_id', id).neq('storage_path', result.path);
      }
    }

    await audit('admin.post.update', { actorId: admin.id, entity: 'post', entityId: id });
  } catch (err) {
    if (err instanceof AuthError) return { error: 'Not found.' };
    console.error('[admin] updatePost', err);
    return { error: 'Something went wrong.' };
  }

  revalidatePath('/feed');
  revalidatePath('/admin');
  redirect('/admin?updated=1');
}

/** Publish or unpublish without opening the editor. */
export async function setPostStatus(id: string, publish: boolean): Promise<AdminState> {
  try {
    const admin = await requireAdmin();
    if (!z.uuid().safeParse(id).success) return { error: 'Unknown post.' };

    const db = createAdminClient();
    const { data: existing } = await db.from('posts').select('published_at').eq('id', id).maybeSingle();

    const { error } = await db
      .from('posts')
      .update({
        status: publish ? 'published' : 'draft',
        published_at: publish ? (existing?.published_at ?? new Date().toISOString()) : null,
      })
      .eq('id', id);

    if (error) return { error: 'Could not change that.' };

    await audit(publish ? 'admin.post.publish' : 'admin.post.update', {
      actorId: admin.id,
      entity: 'post',
      entityId: id,
      metadata: { status: publish ? 'published' : 'draft' },
    });

    revalidatePath('/feed');
    revalidatePath('/admin');
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthError) return { error: 'Not found.' };
    return { error: 'Something went wrong.' };
  }
}

export async function deletePost(id: string): Promise<AdminState> {
  try {
    const admin = await requireAdmin();
    if (!z.uuid().safeParse(id).success) return { error: 'Unknown post.' };

    const db = createAdminClient();

    // Remove the stored objects first; the cascade would drop the rows and
    // strand the files.
    const { data: media } = await db.from('post_media').select('storage_path').eq('post_id', id);
    if (media?.length) {
      await db.storage.from(BUCKET).remove(media.map((m) => m.storage_path));
    }

    const { error } = await db.from('posts').delete().eq('id', id);
    if (error) return { error: 'Could not delete that post.' };

    await audit('admin.post.delete', { actorId: admin.id, entity: 'post', entityId: id });

    revalidatePath('/feed');
    revalidatePath('/admin');
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthError) return { error: 'Not found.' };
    return { error: 'Something went wrong.' };
  }
}
