import 'server-only';
import Stripe from 'stripe';
import { requireStripeEnv } from '@/lib/env.server';

let cached: Stripe | null = null;

export function stripe(): Stripe {
  if (!cached) {
    const { secretKey } = requireStripeEnv();
    cached = new Stripe(secretKey, {
      // Pinned deliberately. Letting Stripe pick the account default means a
      // dashboard-side API upgrade can change webhook payload shapes under a
      // running deployment.
      apiVersion: '2026-08-26.dahlia',
      appInfo: { name: 'doubledub', version: '0.1.0' },
      maxNetworkRetries: 2,
    });
  }
  return cached;
}

/**
 * Finds the Stripe price for one of our plan lookup keys.
 *
 * Looked up rather than hardcoded so that price ids are not baked into the
 * codebase or the environment — the lookup key is the stable contract.
 */
export async function priceIdForLookupKey(lookupKey: string): Promise<string | null> {
  const prices = await stripe().prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  return prices.data[0]?.id ?? null;
}
