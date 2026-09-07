import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { requireStripeEnv } from '@/lib/env.server';
import { createAdminClient } from '@/lib/supabase/server';
import { termDaysForLookupKey } from '@/lib/plans';
import { audit } from '@/lib/audit';
import type { Database } from '@/lib/database.types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SubscriptionStatus = Database['public']['Enums']['subscription_status'];

/**
 * Stripe webhook — the only writer of entitlements.
 *
 * Three properties this handler has to hold:
 *
 *   1. Authenticated by SIGNATURE, not by session. It is excluded from the auth
 *      middleware, so signature verification below is the entire gate. An
 *      unsigned request must never reach the database.
 *
 *   2. Idempotent. Stripe retries, and will happily deliver the same event
 *      twice. Event ids are inserted into `stripe_events` first; a duplicate
 *      loses the primary-key race and returns early.
 *
 *   3. Ordered-ish. Stripe does not guarantee delivery order, so subscription
 *      state is always re-read from Stripe rather than inferred from whichever
 *      event happened to arrive.
 */

const HANDLED = new Set<Stripe.Event.Type>([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
]);

export async function POST(request: NextRequest) {
  const { webhookSecret } = requireStripeEnv();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature.' }, { status: 400 });
  }

  // Must be the raw body. Any parsing or re-serialization breaks the HMAC.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed', err);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Idempotency gate. Claim the event id before doing any work.
  const { error: claimError } = await admin
    .from('stripe_events')
    .insert({ id: event.id, type: event.type, payload: event as never });

  if (claimError) {
    // 23505 = unique violation: we have already processed this delivery.
    if (claimError.code === '23505') {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error('[stripe-webhook] could not claim event', claimError);
    // 500 makes Stripe retry, which is what we want — we have not acted yet.
    return NextResponse.json({ error: 'Storage failure.' }, { status: 500 });
  }

  if (!HANDLED.has(event.type)) {
    return NextResponse.json({ received: true, ignored: true });
  }

  try {
    await handleEvent(event);
  } catch (err) {
    console.error('[stripe-webhook] handler failed', event.type, err);
    // Release the idempotency claim so Stripe's retry can genuinely re-run.
    await admin.from('stripe_events').delete().eq('id', event.id);
    return NextResponse.json({ error: 'Handler failure.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode !== 'subscription' || !session.subscription) return;
      const subscriptionId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
      await syncSubscription(subscriptionId);
      return;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      await syncSubscription(event.data.object.id);
      return;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string | null };
      if (invoice.subscription) {
        const id =
          typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription;
        await syncSubscription(id);
      }
      return;
    }

    default:
      return;
  }
}

/**
 * Re-reads the subscription from Stripe and mirrors it into `subscriptions`.
 *
 * Always re-fetching rather than trusting the event payload is what makes
 * out-of-order delivery harmless: whichever event arrives last, the row ends up
 * matching Stripe's current truth.
 */
async function syncSubscription(subscriptionId: string): Promise<void> {
  const admin = createAdminClient();

  const subscription = await stripe().subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price'],
  });

  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  const userId = await resolveUserId(customerId, subscription.metadata?.supabase_user_id);
  if (!userId) {
    // Loud rather than silent: an unattributable payment is a real incident,
    // not something to swallow.
    console.error('[stripe-webhook] could not attribute subscription', {
      subscriptionId,
      customerId,
    });
    throw new Error('Unattributable subscription');
  }

  const item = subscription.items.data[0];
  const price = item?.price;
  const lookupKey = price?.lookup_key ?? subscription.metadata?.plan_code ?? null;
  const termDays = termDaysForLookupKey(lookupKey);

  // Stripe moved the period fields onto the subscription item; fall back to the
  // subscription for older API shapes.
  const periodEndUnix =
    (item as { current_period_end?: number } | undefined)?.current_period_end ??
    (subscription as unknown as { current_period_end?: number }).current_period_end ??
    null;

  const { error } = await admin.from('subscriptions').upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      status: subscription.status as SubscriptionStatus,
      price_id: price?.id ?? null,
      plan_code: lookupKey,
      term_days: termDays,
      current_period_end: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end,
    },
    { onConflict: 'user_id' },
  );

  if (error) throw new Error(`subscriptions upsert failed: ${error.message}`);

  await audit(
    subscription.status === 'canceled'
      ? 'billing.subscription.canceled'
      : 'billing.subscription.updated',
    {
      actorId: userId,
      entity: 'subscription',
      entityId: subscription.id,
      metadata: { status: subscription.status, planCode: lookupKey, termDays },
    },
  );
}

/** Prefers our own customer mapping; falls back to the metadata we set at checkout. */
async function resolveUserId(
  customerId: string,
  metadataUserId?: string,
): Promise<string | null> {
  const admin = createAdminClient();

  const { data } = await admin
    .from('billing_customers')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  if (data?.user_id) return data.user_id;
  if (!metadataUserId) return null;

  // Self-heal: the mapping row is missing but the subscription knows who this
  // is, so write it back rather than failing every future event.
  await admin
    .from('billing_customers')
    .upsert({ user_id: metadataUserId, stripe_customer_id: customerId }, { onConflict: 'user_id' });

  return metadataUserId;
}
