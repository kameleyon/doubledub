import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { stripe, priceIdForLookupKey } from '@/lib/stripe';
import { getPlan, isPlanCode } from '@/lib/plans';
import { requireUser, AuthError } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/server';
import { enforceRateLimit, RateLimitError } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { publicEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  planCode: z.string().refine(isPlanCode, 'unknown plan'),
});

function safeOrigin(candidate: string): string {
  try {
    const url = new URL(candidate);
    if (url.protocol === 'https:' || url.hostname === 'localhost') return url.origin;
  } catch {
    // fall through
  }
  return publicEnv.NEXT_PUBLIC_SITE_URL;
}

/**
 * Creates a Stripe Checkout session for the signed-in member.
 *
 * The client sends a plan CODE, never a price or an amount. Everything about
 * what the member is charged is resolved server-side from Stripe, so a tampered
 * request body cannot buy a year of access for three days' money.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    await enforceRateLimit('checkout', user.id);

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 });
    }

    const plan = getPlan(parsed.data.planCode as never);
    const priceId = await priceIdForLookupKey(plan.lookupKey);
    if (!priceId) {
      // A configuration problem, not a member problem — say so plainly in the
      // logs and give the member something actionable.
      console.error(`[checkout] no active Stripe price for lookup key ${plan.lookupKey}`);
      return NextResponse.json(
        { error: 'That plan is not available right now.' },
        { status: 503 },
      );
    }

    const admin = createAdminClient();

    // Reuse this member's Stripe customer if we have already made one, so a
    // second checkout does not fragment their billing history.
    const { data: existing } = await admin
      .from('billing_customers')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let customerId = existing?.stripe_customer_id ?? null;

    if (!customerId) {
      const customer = await stripe().customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      const { error: mapErr } = await admin
        .from('billing_customers')
        .insert({ user_id: user.id, stripe_customer_id: customerId });

      if (mapErr) {
        // Losing this mapping would orphan the customer and let a retry create
        // a duplicate, so fail rather than proceed.
        console.error('[checkout] failed to persist customer mapping', mapErr);
        return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 });
      }
    }

    // Return the member to the SAME origin they started on, so a preview
    // deployment sends them back to that preview and a custom domain sends them
    // back to the custom domain — rather than to whatever host happened to be
    // baked into the environment at build time.
    //
    // Taken from nextUrl (the resolved request URL), NOT from the Origin or
    // Host request headers: those are supplied by the caller, and feeding an
    // attacker-controlled value into a redirect target is how open redirects
    // get built. Anything that is not http(s) falls back to the configured URL.
    const origin = safeOrigin(request.nextUrl.origin);

    const session = await stripe().checkout.sessions.create(
      {
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/feed?welcome=1`,
        cancel_url: `${origin}/membership?canceled=1`,
        allow_promotion_codes: true,
        // Echoed back on the webhook so the entitlement can be attributed even
        // if the customer mapping is somehow missing.
        subscription_data: {
          metadata: { supabase_user_id: user.id, plan_code: plan.code },
        },
        metadata: { supabase_user_id: user.id, plan_code: plan.code },
      },
      // Makes a double-submitted checkout return the same session instead of
      // creating two.
      { idempotencyKey: `checkout:${user.id}:${plan.code}:${Math.floor(Date.now() / 60000)}` },
    );

    await audit('billing.checkout.created', {
      actorId: user.id,
      entity: 'checkout_session',
      entityId: session.id,
      metadata: { planCode: plan.code, priceId },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    console.error('[checkout] unexpected failure', err);
    return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 });
  }
}
