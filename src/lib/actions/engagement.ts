'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireEntitled, AuthError } from '@/lib/auth';
import { enforceRateLimit, RateLimitError } from '@/lib/rate-limit';

const postId = z.uuid();

export type ToggleResult = { ok: boolean; on?: boolean; error?: string };

/**
 * Like / tail toggles.
 *
 * These insert and delete through the SESSION-scoped client, so the policies do
 * the real work: a member can only ever act as themselves, and only on a post
 * they are entitled to read. The checks here exist to produce decent error
 * messages, not to be the gate.
 */
async function toggle(table: 'likes' | 'tails', rawId: string, on: boolean): Promise<ToggleResult> {
  const parsed = postId.safeParse(rawId);
  if (!parsed.success) return { ok: false, error: 'Unknown post.' };

  try {
    const { user } = await requireEntitled();
    await enforceRateLimit('engagement', user.id);

    const supabase = await createClient();

    if (on) {
      const { error } = await supabase
        .from(table)
        .insert({ post_id: parsed.data, user_id: user.id });
      // 23505 = already there. Idempotent rather than an error: a double-tap
      // should settle on "on", not fail.
      if (error && error.code !== '23505') {
        return { ok: false, error: 'Could not save that.' };
      }
    } else {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('post_id', parsed.data)
        .eq('user_id', user.id);
      if (error) return { ok: false, error: 'Could not save that.' };
    }

    revalidatePath('/feed');
    return { ok: true, on };
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false, error: err.code === 'not_subscribed' ? 'Your membership has lapsed.' : 'Please sign in.' };
    }
    if (err instanceof RateLimitError) {
      return { ok: false, error: 'Slow down a moment.' };
    }
    console.error('[engagement] unexpected', err);
    return { ok: false, error: 'Something went wrong.' };
  }
}

export async function toggleLike(id: string, on: boolean) {
  return toggle('likes', id, on);
}

export async function toggleTail(id: string, on: boolean) {
  return toggle('tails', id, on);
}

/** Records a unique daily view. Fire-and-forget from the client. */
export async function recordView(rawId: string): Promise<void> {
  const parsed = postId.safeParse(rawId);
  if (!parsed.success) return;

  try {
    await requireEntitled();
    const supabase = await createClient();
    await supabase.rpc('record_post_view', { p_post_id: parsed.data });
  } catch {
    // A missed view count is not worth surfacing to the member.
  }
}
