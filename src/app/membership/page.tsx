import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, getEntitlement } from '@/lib/auth';
import { PlanPicker } from '@/components/PlanPicker';

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

  // Already paying — this page is the paywall, not the manage screen.
  if (entitlement.active) redirect('/feed');

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col px-[18px] pt-5 pb-8">
      <header className="flex items-center gap-1 pb-3">
        <Link
          href="/feed"
          className="flex h-11 w-11 items-center justify-center text-[#C9C9CE] no-underline"
          aria-label="Back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m14.5 5-7 7 7 7" />
          </svg>
        </Link>
        <span className="text-[15px] font-semibold tracking-[-0.015em]">Membership</span>
      </header>

      <div className="px-[2px] pt-1 pb-5">
        <div className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-[var(--color-accent)]">
          Full access
        </div>
        <h1 className="mt-[10px] text-[26px] font-bold leading-[1.18] tracking-[-0.035em] text-balance">
          Every pick, the second it drops.
        </h1>
        <p className="mt-[10px] text-[13.5px] leading-relaxed text-[var(--color-ink-2)] text-pretty">
          Members see the full feed, tail a play with one tap, and can comment on every pick.
          Cancel any time.
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
    </main>
  );
}
