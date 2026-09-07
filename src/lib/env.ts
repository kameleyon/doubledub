import { z } from 'zod';

/**
 * Environment is validated once, at module load, and the process refuses to
 * start if anything required is missing or malformed. A missing Stripe secret
 * should surface as a boot failure, not as a 500 the first time a member tries
 * to pay.
 *
 * Client-side code may only ever import `publicEnv`. `serverEnv` is guarded by
 * `server-only` and will fail the build if it is pulled into a client bundle.
 */

/**
 * z.httpUrl() rejects hostnames without a TLD, which means it rejects
 * http://localhost:3000 and breaks local development. z.url() is deprecated in
 * zod 4. So: an explicit check that accepts any http(s) origin.
 */
const httpUrl = z.string().refine((value) => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}, 'must be an http(s) URL');

const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});

// Next.js inlines `process.env.NEXT_PUBLIC_*` at build time only when it is
// referenced statically, so these must be spelled out rather than looped over.
const parsedPublic = publicSchema.safeParse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

if (!parsedPublic.success) {
  throw new Error(
    `Invalid public environment:\n${parsedPublic.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n')}`,
  );
}

export const publicEnv = parsedPublic.data;
