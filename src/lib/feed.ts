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
  betType: BetType;
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

export type BetType = 'single' | 'parlay' | 'prop' | 'total' | 'futures' | 'live';

/**
 * The feed is browsed by TYPE OF BET across every sport — members pick the
 * kind of play they want, not the sport.
 */
export const BET_TYPES: { value: BetType; label: string }[] = [
  { value: 'single', label: 'Straight' },
  { value: 'parlay', label: 'Parlay' },
  { value: 'prop', label: 'Prop' },
  { value: 'total', label: 'Over / Under' },
  { value: 'futures', label: 'Futures' },
  { value: 'live', label: 'Live' },
];

export const BET_TYPE_LABEL: Record<BetType, string> = Object.fromEntries(
  BET_TYPES.map((b) => [b.value, b.label]),
) as Record<BetType, string>;

export type TimeRange = 'today' | '48h' | '7d' | '30d' | 'all';

/** How far back the feed reaches. Members mostly want "what is live now". */
export const TIME_RANGES: { value: TimeRange; label: string; hours: number | null }[] = [
  { value: 'today', label: 'Today', hours: 24 },
  { value: '48h', label: '48 hours', hours: 48 },
  { value: '7d', label: 'This week', hours: 24 * 7 },
  { value: '30d', label: 'This month', hours: 24 * 30 },
  { value: 'all', label: 'All time', hours: null },
];

export function isTimeRange(value: unknown): value is TimeRange {
  return typeof value === 'string' && TIME_RANGES.some((t) => t.value === value);
}

/** Resolves a range to an ISO cutoff, or null for "no lower bound". */
export function rangeCutoff(value: unknown): string | null {
  if (!isTimeRange(value) || value === 'all') return null;
  const hours = TIME_RANGES.find((t) => t.value === value)?.hours;
  if (!hours) return null;
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

/** Narrows an untrusted query-string value to a real bet type. */
export function isBetType(value: unknown): value is BetType {
  return typeof value === 'string' && BET_TYPES.some((b) => b.value === value);
}

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

