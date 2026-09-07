'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { clientIp, enforceRateLimit, RateLimitError } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { publicEnv } from '@/lib/env';

export type AuthState = { error?: string; notice?: string };

const credentials = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(200),
});

/**
 * Deliberately vague on failure.
 *
 * "Wrong password" versus "no such account" is an account-enumeration oracle —
 * it lets someone discover which emails are members. One message covers both.
 */
const SIGN_IN_FAILED = 'Email or password is incorrect.';

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check your details.' };
  }

  try {
    await enforceRateLimit('auth', await clientIp());
  } catch (err) {
    if (err instanceof RateLimitError) {
      await audit('security.rate_limited', { entity: 'auth', metadata: { action: 'sign_in' } });
      return { error: 'Too many attempts. Try again in a few minutes.' };
    }
    throw err;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    await audit('auth.signin.failed', { metadata: { reason: error.message } });
    return { error: SIGN_IN_FAILED };
  }

  const next = String(formData.get('next') ?? '/feed');
  redirect(safeNext(next));
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check your details.' };
  }

  if (formData.get('age') !== 'on') {
    return { error: 'You must confirm you are 21 or older.' };
  }

  try {
    await enforceRateLimit('auth', await clientIp());
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { error: 'Too many attempts. Try again in a few minutes.' };
    }
    throw err;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/callback` },
  });

  if (error) {
    // Supabase returns a generic error for an existing address when email
    // confirmation is on; surface its message but never confirm the address
    // is registered.
    return { error: error.message };
  }

  // With confirmations enabled, `session` is null and the member must click the
  // emailed link. With them disabled, they are already signed in.
  if (!data.session) {
    return {
      notice: 'Check your email for a confirmation link, then sign in.',
    };
  }

  redirect('/membership');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}

/** Only ever redirect within this app — an open redirect is a phishing gift. */
function safeNext(next: string): string {
  if (!next.startsWith('/') || next.startsWith('//')) return '/feed';
  return next;
}
