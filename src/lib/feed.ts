/**
 * Client-safe feed types, constants and formatters.
 *
 * Deliberately separate from `posts.ts`: that module is `server-only` because
 * it reaches the database through a client built with the secret key. A client
 * component importing a shared type from it would drag the whole server chain
 * into the browser bundle — which is exactly what the build refused to do.
 * Anything both sides need lives here, and here there is nothing to leak.
 */

export type FeedMedia = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  expiresAt: string;
};

export type FeedLeg = {
  selection: string;
  market: string;
  odds: string;
  units: number | null;
};

export type FeedPost = {
  id: string;
  kind: 'slip' | 'text';
  league: string;
  title: string;
  caption: string;
  publishedAt: string;
  pinned: boolean;
  legs: FeedLeg[];
  media: FeedMedia[];
  likeCount: number;
  tailCount: number;
  commentCount: number;
  viewCount: number;
  liked: boolean;
  tailed: boolean;
};

export const FEED_PAGE_SIZE = 12;

export const LEAGUE_FILTERS = ['All', 'MLB', 'NBA', 'NFL', 'NHL', 'TENNIS', 'SOCCER', 'UFC'] as const;

/** "7 min ago" / "3 hours ago" / "Sep 4". Feed timestamps read better relative. */
export function relativeTime(iso: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const mins = Math.floor((Date.now() - then) / 60000);

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;

  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatViews(n: number): string {
  if (n < 1000) return `${n} views`;
  return `${(n / 1000).toFixed(1)}k views`;
}

export function prettyLeague(league: string): string {
  if (league === 'TENNIS') return 'Tennis';
  if (league === 'SOCCER') return 'Soccer';
  return league;
}
