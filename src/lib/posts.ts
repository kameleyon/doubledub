import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { requireEntitled } from '@/lib/auth';
import { signMediaForPosts } from '@/lib/media';
import { FEED_PAGE_SIZE, isBetType, rangeCutoff, type FeedPost } from '@/lib/feed';

export type { FeedPost, FeedMedia } from '@/lib/feed';

/**
 * Loads one page of the feed for the signed-in member.
 *
 * Every read here goes through the session-scoped client, so row level security
 * decides what comes back. This function does no authorization of its own — it
 * cannot accidentally widen access, only narrow it.
 */
export async function getFeed(
  opts: { betType?: string; range?: string; before?: string } = {},
): Promise<FeedPost[]> {
  const { user } = await requireEntitled();
  const supabase = await createClient();

  let query = supabase
    .from('posts')
    .select(
      `id, kind, bet_type, title, caption, published_at, pinned_until,
       like_count, tail_count, comment_count, view_count`,
    )
    // Filter explicitly rather than leaning on RLS alone.
    //
    // The admin policy grants SELECT on every post, drafts included, so without
    // this an admin's feed silently differed from what members actually see —
    // exactly the person who most needs an accurate view of the product.
    // RLS stays the security backstop; this is about showing the truth.
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false })
    .limit(FEED_PAGE_SIZE);

  // Validated rather than cast: an unrecognised ?type= value is ignored
  // instead of being handed to the database.
  if (isBetType(opts.betType)) {
    query = query.eq('bet_type', opts.betType);
  }

  const cutoff = rangeCutoff(opts.range);
  if (cutoff) {
    query = query.gte('published_at', cutoff);
  }
  // Keyset pagination rather than offset: stable under inserts, and it stays
  // fast as the feed grows because it rides the published_at index.
  if (opts.before) {
    query = query.lt('published_at', opts.before);
  }

  const { data: rows, error } = await query;
  if (error || !rows?.length) return [];

  const ids = rows.map((r) => r.id);

  // Fetch engagement state and signed media alongside, not per card.
  // Tails and comments are hidden from the feed for now. The tables, counters
  // and policies all still exist, so restoring them is a UI change — but there
  // is no point paying for the per-member tail lookup while nothing shows it.
  const [likesRes, mediaMap] = await Promise.all([
    supabase.from('likes').select('post_id').in('post_id', ids).eq('user_id', user.id),
    signMediaForPosts(ids.filter((_, i) => rows[i].kind === 'slip')),
  ]);

  const liked = new Set((likesRes.data ?? []).map((r) => r.post_id));
  const now = Date.now();

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    betType: r.bet_type,
    title: r.title,
    caption: r.caption,
    publishedAt: r.published_at ?? '',
    pinned: r.pinned_until ? new Date(r.pinned_until).getTime() > now : false,
    media: mediaMap.get(r.id) ?? [],
    likeCount: r.like_count,
    tailCount: r.tail_count,
    commentCount: r.comment_count,
    viewCount: r.view_count,
    liked: liked.has(r.id),
    tailed: false,
  }));
}
