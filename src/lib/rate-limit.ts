import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';

/**
 * Rate limiting backed by Postgres.
 *
 * Deliberately not an in-memory counter: serverless instances do not share
 * memory, so a Map would let an attacker spread requests across cold starts and
 * never hit the limit. A shared table is the only honest place to count.
 */

export const LIMITS = {
  /** Sign-in and sign-up attempts, per IP. Brute-force and enumeration guard. */
  auth: { max: 10, windowSeconds: 300 },
  /** Password reset mails, per IP, so we are not used as a spam relay. */
  passwordReset: { max: 4, windowSeconds: 3600 },
  /** Comment posting, per member. */
  comment: { max: 20, windowSeconds: 600 },
  /** Like / tail toggling, per member. Generous — this is anti-abuse, not UX friction. */
  engagement: { max: 120, windowSeconds: 60 },
  /** Signed media URL minting, per member. A scraper pulling every slip trips this. */
  media: { max: 90, windowSeconds: 60 },
  /** Stripe checkout session creation, per member. */
  checkout: { max: 8, windowSeconds: 600 },
} as const;

export type LimitName = keyof typeof LIMITS;

/**
 * Best-effort client IP. Trusts `x-forwarded-for` only because Vercel overwrites
 * it at the edge; behind any other proxy this must be revisited, since a
 * spoofable IP makes an IP-keyed limit worthless.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return h.get('x-real-ip') ?? 'unknown';
}

/**
 * Returns true when the call is allowed.
 *
 * Fails CLOSED on a database error. A rate limiter that silently stops limiting
 * when the database is unhappy is worse than none, because it hides the failure
 * exactly when load is highest.
 */
export async function checkRateLimit(name: LimitName, subject: string): Promise<boolean> {
  const { max, windowSeconds } = LIMITS[name];
  const admin = createAdminClient();

  const { data, error } = await admin.rpc('check_rate_limit', {
    p_bucket: name,
    p_subject: subject,
    p_max_hits: max,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error('[rate-limit] check failed, denying request', { name, error: error.message });
    return false;
  }

  return data === true;
}

export class RateLimitError extends Error {
  readonly status = 429;
  constructor(readonly limit: LimitName) {
    super('Too many requests. Try again shortly.');
    this.name = 'RateLimitError';
  }
}

export async function enforceRateLimit(name: LimitName, subject: string): Promise<void> {
  if (!(await checkRateLimit(name, subject))) {
    throw new RateLimitError(name);
  }
}
