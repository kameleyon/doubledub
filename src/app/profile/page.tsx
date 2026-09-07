import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser, getEntitlement, isAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { BottomNav } from '@/components/BottomNav';
import { formatPrice, PLANS } from '@/lib/plans';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Profile' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in?next=%2Fprofile');

  const [entitlement, admin, supabase] = await Promise.all([
    getEntitlement(),
    isAdmin(user.id),
    createClient(),
  ]);

  const { count: tailCount } = await supabase
    .from('tails')
    .select('post_id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  const plan = PLANS.find((p) => p.termDays === entitlement.termDays);
  const renews = entitlement.currentPeriodEnd
    ? new Date(entitlement.currentPeriodEnd).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[440px] flex-col overflow-hidden">
      <header className="flex flex-shrink-0 items-center justify-between px-[18px] pt-[22px] pb-[10px]">
        <span className="text-[19px] font-bold tracking-[-0.03em]">Profile</span>
      </header>

      <div className="dd-scroll flex-1 overflow-y-auto px-[18px] pb-5">
        <div className="flex items-center gap-[14px] pt-1">
          <span className="flex h-[58px] w-[58px] flex-shrink-0 items-center justify-center rounded-[18px] border border-[#3A3A41] bg-[#2A2436] text-[19px] font-bold text-[var(--color-accent)]">
            {(user.email ?? 'M').slice(0, 2).toUpperCase()}
          </span>
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-[15px] font-semibold tracking-[-0.02em] break-all">
              {user.email}
            </span>
            <span className="text-[12px] text-[var(--color-ink-3)]">
              Member since{' '}
              {new Date(user.created_at).toLocaleDateString('en-US', {
                month: 'short',
                year: 'numeric',
              })}
              {admin ? ' · Admin' : ''}
            </span>
          </div>
        </div>

        <div className="mt-[18px] flex gap-[9px]">
          <Stat value={String(tailCount ?? 0)} label="Tails" />
          <Stat value={entitlement.active ? plan?.label ?? 'Active' : 'None'} label="Plan" />
          <Stat value={entitlement.active ? 'Active' : 'Lapsed'} label="Status" />
        </div>

        <section
          className={`mt-[18px] rounded-[16px] border-[1.5px] p-[17px] ${
            entitlement.active
              ? 'border-[var(--color-accent)] bg-[rgba(248,209,23,0.055)]'
              : 'border-[var(--color-line)] bg-[var(--color-surface)]'
          }`}
        >
          <div className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-[var(--color-accent)]">
            {entitlement.active ? 'Active membership' : 'No membership'}
          </div>
          <div className="mt-[7px] text-[17px] font-bold tracking-[-0.025em]">
            {entitlement.active ? `${plan?.label ?? 'Access'}` : 'Not subscribed'}
          </div>
          <div className="mt-[5px] text-[12px] text-[var(--color-ink-2)]">
            {entitlement.active && renews
              ? `${entitlement.cancelAtPeriodEnd ? 'Ends' : 'Renews'} ${renews}${
                  plan ? ` · ${formatPrice(plan.amountCents)}` : ''
                }`
              : 'Choose a plan to unlock the feed.'}
          </div>
          <Link
            href="/membership"
            className="mt-[15px] flex h-[46px] items-center justify-center rounded-[12px] bg-[var(--color-accent)] text-[13px] font-semibold text-[var(--color-on-accent)] no-underline"
          >
            {entitlement.active ? 'Change plan' : 'Choose a plan'}
          </Link>
        </section>

        {admin ? (
          <Link
            href="/admin"
            className="mt-3 flex h-[50px] items-center justify-between rounded-[13px] border border-[var(--color-line)] bg-[var(--color-surface)] px-4 text-[13.5px] font-medium text-[var(--color-ink)] no-underline"
          >
            Admin panel
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#55555C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9.5 5 7 7-7 7" />
            </svg>
          </Link>
        ) : null}

        <div className="mt-6 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-ink-4)]">
          Account
        </div>
        <div className="mt-[10px] overflow-hidden rounded-[13px] border border-[var(--color-line)] bg-[var(--color-surface)]">
          <Row label="Email address" value={user.email ?? ''} />
          <div className="ml-4 h-px bg-[#26262B]" />
          <Row label="Password" value="••••••••••" />
        </div>

        {/* POST, not a link: a GET sign-out can be fired by any prefetch or
            image tag on a page the member visits. */}
        <form action="/auth/sign-out" method="post" className="mt-6">
          <button
            type="submit"
            className="flex h-[50px] w-full items-center justify-center rounded-[12px] border border-[var(--color-line)] bg-[var(--color-surface)] text-[13.5px] font-medium text-[#C9C9CE]"
          >
            Log out
          </button>
        </form>

        <p className="mt-6 text-center text-[10.5px] leading-relaxed text-[var(--color-ink-4)]">
          doubledub publishes information and opinion only and does not accept wagers. 21+ only.
          Gambling problem? Call 1-800-GAMBLER.
        </p>
      </div>

      <BottomNav active="/profile" />
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1 rounded-[13px] border border-[var(--color-line)] bg-[var(--color-surface)] p-[13px]">
      <div className="font-mono text-[17px] font-medium text-[var(--color-ink)]">{value}</div>
      <div className="mt-1 text-[10.5px] font-medium uppercase tracking-[0.06em] text-[var(--color-ink-3)]">
        {label}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[58px] items-center gap-3 px-4 py-3">
      <span className="flex flex-1 flex-col gap-[3px] overflow-hidden">
        <span className="text-[11.5px] text-[var(--color-ink-3)]">{label}</span>
        <span className="truncate text-[13.5px] font-medium text-[var(--color-ink)]">{value}</span>
      </span>
    </div>
  );
}
