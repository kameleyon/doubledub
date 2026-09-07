import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Runs on every request (Next 16 "proxy" convention). Three jobs:
 *
 *   1. Refresh the Supabase session so server components see a live token.
 *   2. Bounce signed-out visitors away from member and admin routes.
 *   3. Attach security headers, including a nonce-based Content Security Policy.
 *
 * This is a first line of defence and a redirect layer — not the security
 * boundary. Authorization is enforced in the database by row level security, so
 * a mistake in the matcher below leaks nothing on its own.
 */

const PUBLIC_PATHS = ['/', '/sign-in', '/sign-up', '/reset-password', '/legal', '/auth/callback'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function buildCsp(nonce: string, isDev: boolean): string {
  const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

  return [
    `default-src 'self'`,
    // 'strict-dynamic' lets scripts the nonced bundle loads run, without
    // needing to enumerate every chunk URL. In dev, Next's HMR needs eval.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isDev ? "'unsafe-eval'" : ''}`,
    // Next injects inline styles for streaming; a nonce is not plumbed through
    // to them, so 'unsafe-inline' for styles is the pragmatic ceiling here.
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' https://fonts.gstatic.com data:`,
    // blob: so slip images can be rendered from a fetched blob rather than a
    // URL the browser can right-click and copy.
    `img-src 'self' blob: data: ${supabaseOrigin}`,
    `connect-src 'self' ${supabaseOrigin} https://api.stripe.com`,
    `frame-src https://js.stripe.com https://hooks.stripe.com`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `upgrade-insecure-requests`,
  ]
    .filter(Boolean)
    .join('; ');
}

export default async function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV === 'development';

  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonce = btoa(String.fromCharCode(...nonceBytes));

  const csp = buildCsp(nonce, isDev);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Next reads the nonce out of the CSP on the REQUEST to stamp it onto its own
  // script tags. Setting it only on the response left every script un-nonced,
  // which — combined with 'strict-dynamic' — blocked all client JavaScript in
  // production. Locally `next start` papered over it; Vercel did not.
  requestHeaders.set('Content-Security-Policy', csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Validates the token with the auth server rather than trusting the cookie.
  // Also refreshes it, which is why this must run before any server component.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Signed-in members have no reason to sit on the sign-in page.
  if (user && (pathname === '/sign-in' || pathname === '/sign-up')) {
    const url = request.nextUrl.clone();
    url.pathname = '/feed';
    url.search = '';
    return NextResponse.redirect(url);
  }

  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  );
  // Members-only content must never be cached by a shared proxy.
  if (!isPublic(pathname)) {
    response.headers.set('Cache-Control', 'private, no-store');
  }
  if (!isDev) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    );
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Skip Next's internals, the Stripe webhook, and anything that looks like a
     * static file.
     *
     * The extension check is load-bearing: without it, /ddlogo.png was treated
     * as a protected route and 307'd to /sign-in, which also broke
     * /_next/image because the optimizer could not fetch its own source.
     *
     * The webhook is excluded because it is authenticated by signature, not by
     * session — running it through the auth redirect would bounce Stripe to
     * /sign-in and silently drop payment events.
     */
    '/((?!_next/static|_next/image|api/stripe/webhook|.*\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|txt|xml|webmanifest|json|woff|woff2|ttf|otf|mp4|webm)$).*)',
  ],
};
