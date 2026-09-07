import 'server-only';
import { z } from 'zod';

/**
 * Server-only environment. The `server-only` import above is load-bearing: if
 * any client component ever imports this module, the build fails rather than
 * silently shipping the Supabase secret key or the Stripe secret to a browser.
 */

const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z
    .string()
    .min(20)
    .refine((v) => !v.startsWith('sb_publishable_'), {
      message: 'looks like the publishable key — the secret key is required here',
    }),
  SUPABASE_PROJECT_REF: z.string().min(10),

  // Stripe is optional until billing is switched on, so that the app still
  // boots for schema and auth work. Anything that actually charges a card
  // calls `requireStripeEnv()` and fails loudly if it is not configured.
  STRIPE_SECRET_KEY: z.string().startsWith('sk_').optional().or(z.literal('')),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_').optional().or(z.literal('')),

  MEDIA_URL_SECRET: z.string().min(32),
});

const parsed = serverSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Invalid server environment:\n${parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n')}`,
  );
}

export const serverEnv = parsed.data;

export function requireStripeEnv() {
  const { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } = serverEnv;
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    throw new Error(
      'Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET before using billing.',
    );
  }
  return { secretKey: STRIPE_SECRET_KEY, webhookSecret: STRIPE_WEBHOOK_SECRET };
}
