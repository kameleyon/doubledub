'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PLANS, formatPrice, perDayPrice } from '@/lib/plans';

/**
 * Public plan ladder.
 *
 * Shows the four terms most people pick, then reveals the full eight in place.
 * Previously "See all plans" linked to sign-up, which showed no plans at all —
 * the label promised something the destination did not deliver.
 */
export function PlanShowcase() {
  const [expanded, setExpanded] = useState(false);

  const shortlist = ['dd_3d', 'dd_1w', 'dd_1m', 'dd_1y'];
  const visible = expanded ? PLANS : PLANS.filter((p) => shortlist.includes(p.code));

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-[10px]">
        {visible.map((p) => (
          <div
            key={p.code}
            className={`rounded-[14px] border p-4 ${
              p.badge
                ? 'border-[var(--color-accent)] bg-[rgba(248,209,23,0.06)]'
                : 'border-[var(--color-line)] bg-[var(--color-surface)]'
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-semibold">{p.label}</span>
              {p.badge ? (
                <span className="text-[8.5px] font-bold uppercase tracking-[0.1em] text-[var(--color-accent)]">
                  {p.badge}
                </span>
              ) : null}
            </div>
            <div className="mt-2 font-mono text-[17px] font-medium text-[var(--color-accent)]">
              {formatPrice(p.amountCents)}
            </div>
            <div className="mt-1 font-mono text-[11px] text-[var(--color-ink-3)]">
              {perDayPrice(p)} / day
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="mx-auto mt-4 flex h-11 items-center gap-[6px] rounded-full px-4 text-[13px] font-medium text-[var(--color-ink-2)]"
      >
        {expanded ? 'Show fewer' : `See all ${PLANS.length} plans`}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={expanded ? 'rotate-180' : ''}
        >
          <path d="m6 9.5 6 6 6-6" />
        </svg>
      </button>

      <Link
        href="/sign-up"
        className="mx-auto mt-2 flex h-[46px] w-fit items-center rounded-full bg-[var(--color-accent)] px-7 text-[14px] font-semibold tracking-[-0.01em] text-[var(--color-on-accent)] no-underline"
      >
        Get access
      </Link>
    </>
  );
}
