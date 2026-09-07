import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, getEntitlement } from '@/lib/auth';
import { PlanPicker } from '@/components/PlanPicker';
import { BottomNav } from '@/components/BottomNav';
import { PLANS, formatPrice } from '@/lib/plans';

export const metadata: Metadata = { title: 'Membership' };
export const dynamic = 'force-dynamic';

export default async function MembershipPage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in?next=%2Fmembership');

  const { canceled } = await searchParams;
  const entitlement = await getEntitlement();
  const currentPlan = PLANS.find((p) => p.termDays === entitlement.termDays);
  const renews = entitlement.currentPeriodEnd
    ? new Date(entitlement.currentPeriodEnd).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;


  return (
    <div className="mx-auto flex h-dvh w-full max-w-[440px] flex-col overflow-hidden">
      <header className="flex flex-shrink-0 items-center px-[18px] pt-[22px] pb-3">
        <span className="text-[19px] font-bold tracking-[-0.03em]">Membership</span>
      </header>

      <div className="dd-scroll flex-1 overflow-y-auto px-[18px] pb-6">

      {entitlement.active ? (
        <section className="mb-6 rounded-[16px] border-[1.5px] border-[var(--color-accent)] bg-[rgba(248,209,23,0.055)] p-[17px]">
          <div className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-[var(--color-accent)]">
            Current plan
          </div>
          <div className="mt-[7px] text-[17px] font-bold tracking-[-0.025em]">
            {currentPlan?.label ?? 'Active membership'}
          </div>
          <div className="mt-[5px] text-[12px] text-[var(--color-ink-2)]">
            {renews
              ? `${entitlement.cancelAtPeriodEnd ? 'Ends' : 'Renews'} ${renews}${
                  currentPlan ? ` · ${formatPrice(currentPlan.amountCents)}` : ''
                }`
              : 'Active'}
          </div>
        </section>
      ) : null}

      <div className="px-[2px] pt-1 pb-5">
        <div className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-[var(--color-accent)]">
          {entitlement.active ? 'Change plan' : 'Full access'}
        </div>
        <h1 className="mt-[10px] text-[26px] font-bold leading-[1.18] tracking-[-0.035em] text-balance">
          {entitlement.active ? 'Switch to a longer term.' : 'Every pick, the second it drops.'}
        </h1>
        <p className="mt-[10px] text-[13.5px] leading-relaxed text-[var(--color-ink-2)] text-pretty">
          {entitlement.active
            ? 'Longer terms cost less per day. Changing plans takes effect immediately.'
            : 'Members see the full feed, tail a play with one tap, and can comment on every pick. Cancel any time.'}
        </p>
      </div>

      {entitlement.status === 'past_due' ? (
        <p className="mb-4 rounded-[11px] border border-[#4A3A22] bg-[#2A2117] px-4 py-3 text-[12.5px] text-[var(--color-warn)]">
          Your last payment failed, so access is paused. Choosing a plan below will restart it.
        </p>
      ) : null}

      {canceled ? (
        <p className="mb-4 rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-[12.5px] text-[var(--color-ink-2)]">
          Checkout was cancelled — nothing has been charged.
        </p>
      ) : null}

      <PlanPicker />

      <p className="mt-4 px-[2px] text-[10.5px] leading-relaxed text-[var(--color-ink-4)] text-pretty">
        By continuing you agree to the <Link href="/legal/terms">Terms</Link>,{' '}
        <Link href="/legal/privacy">Privacy</Link> and{' '}
        <Link href="/legal/refunds">Refund Policy</Link>. Your plan renews automatically until
        cancelled. Cancel any time from your profile.
      </p>
      </div>

      <BottomNav active="/membership" />
    </div>
  );
}
