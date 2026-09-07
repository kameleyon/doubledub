import type { NextConfig } from 'next';

/**
 * Member routes carry paywalled content, so they must never be held by a shared
 * cache.
 *
 * The proxy sets `Cache-Control` too, but Next replaces it while rendering a
 * dynamic route — it emitted `no-cache, must-revalidate`, which permits a proxy
 * to *store* the response and merely revalidate it. `headers()` is applied to
 * the final response, so this is the layer that actually wins.
 */
const MEMBER_ROUTES = ['/feed', '/membership', '/profile', '/search', '/tails'];

const NO_STORE = {
  key: 'Cache-Control',
  value: 'private, no-store, no-cache, max-age=0, must-revalidate',
};

const nextConfig: NextConfig = {
  poweredByHeader: false,

  async headers() {
    return [
      ...MEMBER_ROUTES.flatMap((route) => [
        { source: route, headers: [NO_STORE] },
        { source: `${route}/:path*`, headers: [NO_STORE] },
      ]),
      {
        // Never let a browser or proxy hold a signed media URL or an API reply.
        source: '/api/:path*',
        headers: [NO_STORE],
      },
    ];
  },
};

export default nextConfig;
