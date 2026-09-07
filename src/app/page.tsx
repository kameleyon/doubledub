import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { PLANS, formatPrice, perDayPrice } from '@/lib/plans';
import { BET_TYPES } from '@/lib/feed';

export const metadata: Metadata = {
  title: 'doubledub — better picks, bigger wins',
  // The landing page is the one thing that SHOULD be indexable.
  robots: { index: true, follow: true },
};

const anchor = PLANS.find((p) => p.code === 'dd_1m')!;

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-[520px] px-6 pb-16">
      <header className="flex flex-col items-center gap-4 pt-16">
        <Image
          src="/ddlogo.png"
          alt="doubledub"
          width={260}
          height={87}
          priority
          className="h-auto w-[260px]"
        />
        <span className="text-[9.5px] font-semibold tracking-[0.34em] text-[var(--color-ink-3)]">
          BETTER PICKS&nbsp; BIGGER WINS
        </span>
      </header>

      <section className="pt-14 text-center">
        <h1 className="text-[34px] font-bold leading-[1.12] tracking-[-0.04em] text-balance">
          Every pick, the second it drops.
        </h1>
        <p className="mx-auto mt-4 max-w-[380px] text-[14.5px] leading-relaxed text-[var(--color-ink-2)] text-pretty">
          One feed. Straights, parlays, props and futures across every sport — you take what you
          want. Tail a play with one tap and see what everyone else is on.
        </p>

        <Link
          href="/sign-up"
          className="mx-auto mt-8 flex h-14 w-full max-w-[320px] items-center justify-center rounded-[14px] bg-[var(--color-accent)] text-[15px] font-bold tracking-[-0.02em] text-[var(--color-on-accent)] no-underline"
        >
          Get access
        </Link>
        <p className="mt-3 text-[12.5px] text-[var(--color-ink-3)]">
          From {perDayPrice(anchor)} a day &middot; cancel any time
        </p>
      </section>

      <section className="mt-16">
        <SectionLabel>What you get</SectionLabel>
        <div className="mt-4 flex flex-col gap-[10px]">
          <Feature
            title="Picks the moment they post"
            body="No waiting, no digest. Slips and written plays land in the feed as they happen."
          />
          <Feature
            title="Browse by type of bet"
            body="Filter to the kind of play you actually want — not by sport, across all of them."
          />
          <Feature
            title="Tail with one tap"
            body="Keep every play you have taken in one place, with the odds as they were posted."
          />
          <Feature
            title="Members only, and it stays that way"
            body="Slip images are served through short-lived links. Nothing is shareable outside the app."
          />
        </div>
      </section>

      <section className="mt-14">
        <SectionLabel>Every kind of play</SectionLabel>
        {/* Sized to sit on a single line at this column width; still wraps
            gracefully rather than overflowing on a very narrow screen. */}
        <div className="mt-4 flex flex-wrap justify-center gap-[6px]">
          {BET_TYPES.map((b) => (
            <span
              key={b.value}
              className="whitespace-nowrap rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-[8px] text-[12px] font-medium text-[var(--color-ink-2)]"
            >
              {b.label}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <SectionLabel>Plans</SectionLabel>
        <p className="mt-3 text-[13px] leading-relaxed text-[var(--color-ink-3)]">
          Pick a term that suits you — the longer the term, the lower the daily rate. Every plan
          unlocks the full feed.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-[10px]">
          {PLANS.filter((p) => ['dd_3d', 'dd_1w', 'dd_1m', 'dd_1y'].includes(p.code)).map((p) => (
            <div
              key={p.code}
              className={`rounded-[14px] border p-4 ${
                p.badge
                  ? 'border-[var(--color-accent)] bg-[rgba(248,209,23,0.06)]'
                  : 'border-[var(--color-line)] bg-[var(--color-surface)]'
              }`}
            >
              <div className="text-[13px] font-semibold">{p.label}</div>
              <div className="mt-2 font-mono text-[17px] font-medium text-[var(--color-accent)]">
                {formatPrice(p.amountCents)}
              </div>
              <div className="mt-1 font-mono text-[11px] text-[var(--color-ink-3)]">
                {perDayPrice(p)} / day
              </div>
            </div>
          ))}
        </div>
        <Link
          href="/sign-up"
          className="mt-5 flex h-13 w-full items-center justify-center rounded-[14px] border border-[var(--color-line)] bg-[var(--color-surface)] py-4 text-[14px] font-semibold text-[var(--color-ink)] no-underline"
        >
          See all plans
        </Link>
      </section>

      <footer className="mt-16 border-t border-[var(--color-line)] pt-8 text-center">
        <p className="text-[13px] text-[var(--color-ink-2)]">
          Already a member?{' '}
          <Link href="/sign-in" className="font-semibold">
            Log in
          </Link>
        </p>
        <p className="mt-6 text-[10.5px] leading-relaxed text-[var(--color-ink-4)] text-pretty">
          doubledub publishes information and opinion only and does not accept wagers. Nothing here
          is a guarantee of profit. 21+ only. If you or someone you know has a gambling problem,
          call 1-800-GAMBLER.
        </p>
      </footer>
    </main>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-accent)]">
      {children}
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[14px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      <div className="text-[14px] font-semibold tracking-[-0.015em]">{title}</div>
      <div className="mt-[6px] text-[13px] leading-relaxed text-[var(--color-ink-2)] text-pretty">
        {body}
      </div>
    </div>
  );
}
