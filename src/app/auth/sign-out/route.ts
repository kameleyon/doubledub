import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST only. A GET sign-out can be triggered by any image tag or prefetch on a
 * page the member visits, which makes logging people out a trivial nuisance
 * attack.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/', request.nextUrl.origin), { status: 303 });
}
