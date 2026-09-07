import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';
import { serverEnv } from '@/lib/env.server';
import type { Database } from '@/lib/database.types';

/**
 * Request-scoped client carrying the signed-in member's session.
 *
 * Everything this client reads is subject to row level security, which is the
 * point: even a bug in a route handler cannot return a post to a member whose
 * subscription has lapsed, because the database itself refuses.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Middleware refreshes the session on every request, so dropping
            // the write here is safe rather than silently losing the session.
          }
        },
      },
    },
  );
}

/**
 * Service-role client. Bypasses row level security entirely.
 *
 * Use only where that is genuinely required — the Stripe webhook writing an
 * entitlement, an admin publishing a post, minting a signed media URL — and
 * always after establishing who the caller is. Never hand this client a value
 * that came from a request body without validating it first.
 */
export function createAdminClient() {
  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SECRET_KEY,
    {
      cookies: {
        // Deliberately inert. The admin client must never adopt, refresh or
        // emit a user session; it is not acting on behalf of a browser.
        getAll: () => [],
        setAll: () => {},
      },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
