/**
 * Creates the doubledub membership product and its eight recurring prices in
 * Stripe, each tagged with the `lookup_key` the app resolves at checkout.
 *
 * Idempotent: re-running reuses the existing product and moves each lookup key
 * onto the current price rather than creating duplicates. Safe to run after a
 * price change.
 *
 * Run: node scripts/seed-stripe-prices.mjs
 *      node scripts/seed-stripe-prices.mjs --dry
 */

import Stripe from 'stripe';
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('STRIPE_SECRET_KEY is not set in .env.local');
  process.exit(1);
}

const dry = process.argv.includes('--dry');
const stripe = new Stripe(key, { apiVersion: '2026-08-26.dahlia' });

const PRODUCT_KEY = 'doubledub_membership';

// Mirrors src/lib/plans.ts. Amounts are the sample ladder from the design —
// change them here and re-run; the lookup keys stay stable.
const PLANS = [
  { lookupKey: 'dd_3d', label: '3 days',   amount: 7500,  interval: 'day',   count: 3 },
  { lookupKey: 'dd_1w', label: '1 week',   amount: 7450,  interval: 'week',  count: 1 },
  { lookupKey: 'dd_2w', label: '2 weeks',  amount: 9950,  interval: 'week',  count: 2 },
  { lookupKey: 'dd_1m', label: '1 month',  amount: 14950, interval: 'month', count: 1 },
  { lookupKey: 'dd_2m', label: '2 months', amount: 19950, interval: 'month', count: 2 },
  { lookupKey: 'dd_3m', label: '3 months', amount: 29950, interval: 'month', count: 3 },
  { lookupKey: 'dd_6m', label: '6 months', amount: 39950, interval: 'month', count: 6 },
  { lookupKey: 'dd_1y', label: '1 year',   amount: 64950, interval: 'year',  count: 1 },
];

const mode = key.startsWith('sk_live_') ? 'LIVE' : 'TEST';

async function findOrCreateProduct() {
  const existing = await stripe.products.search({
    query: `metadata['app_key']:'${PRODUCT_KEY}'`,
    limit: 1,
  });
  if (existing.data[0]) return existing.data[0];

  if (dry) return { id: '(would create)', name: 'doubledub membership' };

  return stripe.products.create({
    name: 'doubledub membership',
    description: 'Members-only access to the doubledub picks feed.',
    metadata: { app_key: PRODUCT_KEY },
  });
}

async function main() {
  console.log(`\ndoubledub — Stripe price setup  [${mode} mode]${dry ? '  (dry run)' : ''}\n`);

  const product = await findOrCreateProduct();
  console.log(`product: ${product.id}\n`);

  for (const plan of PLANS) {
    // Is a price already wearing this lookup key, and does it still match?
    const current = await stripe.prices.list({
      lookup_keys: [plan.lookupKey],
      active: true,
      limit: 1,
    });
    const found = current.data[0];

    const matches =
      found &&
      found.unit_amount === plan.amount &&
      found.recurring?.interval === plan.interval &&
      found.recurring?.interval_count === plan.count &&
      found.currency === 'usd';

    if (matches) {
      console.log(`  ok       ${plan.lookupKey.padEnd(6)} ${plan.label.padEnd(9)} $${(plan.amount / 100).toFixed(2).padStart(7)}  ${found.id}`);
      continue;
    }

    if (dry) {
      console.log(`  would ${found ? 'replace' : 'create '} ${plan.lookupKey.padEnd(6)} ${plan.label.padEnd(9)} $${(plan.amount / 100).toFixed(2).padStart(7)}`);
      continue;
    }

    // Stripe prices are immutable, so a change means a new price. Passing
    // transfer_lookup_key moves the key off the old one atomically, which is
    // what keeps the app pointing at the right thing with no downtime.
    const price = await stripe.prices.create({
      product: product.id,
      currency: 'usd',
      unit_amount: plan.amount,
      recurring: { interval: plan.interval, interval_count: plan.count },
      lookup_key: plan.lookupKey,
      transfer_lookup_key: Boolean(found),
      nickname: `doubledub ${plan.label}`,
      metadata: { plan_label: plan.label },
    });

    if (found) {
      // Deactivate the superseded price so it cannot be bought again. Existing
      // subscriptions on it keep billing normally — this only hides it.
      await stripe.prices.update(found.id, { active: false });
    }

    console.log(`  ${found ? 'replaced' : 'created '} ${plan.lookupKey.padEnd(6)} ${plan.label.padEnd(9)} $${(plan.amount / 100).toFixed(2).padStart(7)}  ${price.id}`);
  }

  console.log('\ndone.\n');
}

main().catch((err) => {
  console.error('\nfailed:', err.message);
  process.exit(1);
});
