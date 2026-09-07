/**
 * The membership ladder.
 *
 * `termDays` is doing double duty: it is the billing period AND the entitlement
 * rank compared against `posts.min_term_days`. A post gated at 30 is visible to
 * anyone on a 1-month plan or longer, which is exactly the "1 month plus"
 * audience option in the admin composer.
 *
 * Amounts here are for display and sanity-checking only. Stripe is the
 * authority on what a member is actually charged — never compute a charge from
 * this file, and never trust an amount that arrived from the browser.
 *
 * NOTE: the amounts below are the sample ladder from the reference design.
 * Replace them, and create the matching Stripe prices with these lookup keys,
 * before taking real payments.
 */

export type PlanCode = 'dd_3d' | 'dd_1w' | 'dd_2w' | 'dd_1m' | 'dd_2m' | 'dd_3m' | 'dd_6m' | 'dd_1y';

export type Plan = {
  code: PlanCode;
  /** Stripe price `lookup_key`. Stable across price re-creation, unlike a price id. */
  lookupKey: PlanCode;
  label: string;
  termDays: number;
  interval: 'day' | 'week' | 'month' | 'year';
  intervalCount: number;
  /** Sample display price, in cents. */
  amountCents: number;
  /** Sample struck-through "was" price, in cents. */
  listAmountCents: number;
  badge?: 'Most popular' | 'Best value';
};

export const PLANS: readonly Plan[] = [
  { code: 'dd_3d', lookupKey: 'dd_3d', label: '3 days',   termDays: 3,   interval: 'day',   intervalCount: 3, amountCents: 7500,  listAmountCents: 14900 },
  { code: 'dd_1w', lookupKey: 'dd_1w', label: '1 week',   termDays: 7,   interval: 'week',  intervalCount: 1, amountCents: 7450,  listAmountCents: 14900 },
  { code: 'dd_2w', lookupKey: 'dd_2w', label: '2 weeks',  termDays: 14,  interval: 'week',  intervalCount: 2, amountCents: 9950,  listAmountCents: 19900 },
  { code: 'dd_1m', lookupKey: 'dd_1m', label: '1 month',  termDays: 30,  interval: 'month', intervalCount: 1, amountCents: 14950, listAmountCents: 29900, badge: 'Most popular' },
  { code: 'dd_2m', lookupKey: 'dd_2m', label: '2 months', termDays: 60,  interval: 'month', intervalCount: 2, amountCents: 19950, listAmountCents: 39900 },
  { code: 'dd_3m', lookupKey: 'dd_3m', label: '3 months', termDays: 90,  interval: 'month', intervalCount: 3, amountCents: 29950, listAmountCents: 59900 },
  { code: 'dd_6m', lookupKey: 'dd_6m', label: '6 months', termDays: 180, interval: 'month', intervalCount: 6, amountCents: 39950, listAmountCents: 79900 },
  { code: 'dd_1y', lookupKey: 'dd_1y', label: '1 year',   termDays: 365, interval: 'year',  intervalCount: 1, amountCents: 64950, listAmountCents: 129900, badge: 'Best value' },
] as const;

const BY_CODE = new Map(PLANS.map((p) => [p.code, p]));

export function isPlanCode(value: unknown): value is PlanCode {
  return typeof value === 'string' && BY_CODE.has(value as PlanCode);
}

export function getPlan(code: PlanCode): Plan {
  const plan = BY_CODE.get(code);
  if (!plan) throw new Error(`Unknown plan code: ${code}`);
  return plan;
}

/**
 * Resolves a Stripe lookup key back to a term length.
 *
 * Returns 0 rather than throwing for an unrecognised key: a webhook must never
 * crash on an unexpected price, and 0 means "entitled, but only to ungated
 * posts", which is the safe direction to fail.
 */
export function termDaysForLookupKey(lookupKey: string | null | undefined): number {
  if (!lookupKey) return 0;
  return BY_CODE.get(lookupKey as PlanCode)?.termDays ?? 0;
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function perDayPrice(plan: Plan): string {
  return `$${(plan.amountCents / 100 / plan.termDays).toFixed(2)}`;
}
