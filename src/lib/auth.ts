import 'server-only';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';

/**
 * Authorization helpers. Every protected route funnels through these so the
 * rules live in one auditable place rather than being restated per handler.
 *
 * Note that these are a convenience and a source of good error messages — they
 * are NOT the security boundary. Row level security is. If one of these is ever
 * forgotten, the database still refuses to hand a lapsed member a post.
 */

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 402 | 403,
    readonly code: 'unauthenticated' | 'not_subscribed' | 'not_admin',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Returns the verified user, or null.
 *
 * Always uses `getUser()`, never `getSession()`: `getSession()` reads the JWT
 * straight out of the cookie without contacting the auth server, so a forged or
 * stale cookie would be trusted. `getUser()` validates it.
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError('You must be signed in.', 401, 'unauthenticated');
  }
  return user;
}

export type Entitlement = {
  active: boolean;
  termDays: number;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

/**
 * Reads the caller's own entitlement. Uses the session-scoped client, so RLS
 * guarantees a member can only ever resolve their own row.
 */
export async function getEntitlement(): Promise<Entitlement> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('subscriptions')
    .select('status, term_days, current_period_end, cancel_at_period_end')
    .maybeSingle();

  if (!data) {
    return { active: false, termDays: -1, status: null, currentPeriodEnd: null, cancelAtPeriodEnd: false };
  }

  const live =
    (data.status === 'active' || data.status === 'trialing') &&
    (data.current_period_end === null || new Date(data.current_period_end) > new Date());

  return {
    active: live,
    termDays: live ? data.term_days : -1,
    status: data.status,
    currentPeriodEnd: data.current_period_end,
    cancelAtPeriodEnd: data.cancel_at_period_end,
  };
}

/** Signed in AND paying. Throws 402 for a lapsed member so the UI can route to the paywall. */
export async function requireEntitled(): Promise<{ user: User; entitlement: Entitlement }> {
  const user = await requireUser();
  const entitlement = await getEntitlement();
  if (!entitlement.active) {
    throw new AuthError('An active membership is required.', 402, 'not_subscribed');
  }
  return { user, entitlement };
}

/**
 * Admin check. Deliberately performed with the admin client against a table
 * that `authenticated` holds no grant on, so membership of `admin_users` can
 * never be read — let alone written — with a member's own token.
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return false;
  return data !== null;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (!(await isAdmin(user.id))) {
    // Same message and status a non-admin would get for a nonexistent route,
    // so this does not confirm that an admin area exists.
    throw new AuthError('Not found.', 403, 'not_admin');
  }
  return user;
}
