import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Lands the email-confirmation and magic-link flows.
 *
 * Supabase sends a one-time `code` which is exchanged here for a session. The
 * `next` parameter is validated rather than trusted — an unchecked redirect
 * target on an auth callback is a textbook phishing vector.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const raw = searchParams.get('next') ?? '/feed';
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/feed';

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/sign-in?error=link_expired`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
