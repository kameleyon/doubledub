'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BET_TYPES, TIME_RANGES } from '@/lib/feed';

/**
 * Search entry point plus a collapsed filter panel.
 *
 * Replaces the horizontal chip strip: a scrolling row hides most of its own
 * options off-screen and steals a band of vertical space from the feed on every
 * screen. A single Filters button costs one tap and shows every option at once.
 *
 * Selections live in the URL so they survive refresh and the back button.
 */
export function FeedControls() {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  const betType = params.get('type') ?? 'all';
  const range = params.get('range') ?? 'all';
  const activeCount = (betType !== 'all' ? 1 : 0) + (range !== 'all' ? 1 : 0);

  function apply(key: 'type' | 'range', value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === 'all') next.delete(key);
    else next.set(key, value);
    router.push(`/feed${next.toString() ? `?${next}` : ''}`, { scroll: false });
  }

  function reset() {
    router.push('/feed', { scroll: false });
  }

  return (
    <div className="flex-shrink-0 px-[18px] pb-4">
      <div className="flex gap-[10px]">
        <button
          type="button"
          onClick={() => router.push('/search')}
          className="flex h-[46px] flex-1 items-center gap-[10px] rounded-[13px] border border-[var(--color-line)] bg-[var(--color-surface)] px-[14px] text-left"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#6E6E75" strokeWidth="1.9" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.6-3.6" />
          </svg>
          <span className="text-[13.5px] text-[var(--color-ink-3)]">Search picks</span>
        </button>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`flex h-[46px] items-center gap-[8px] rounded-[13px] border px-[14px] text-[13px] font-medium ${
            activeCount > 0 || open
              ? 'border-[var(--color-accent)] bg-[rgba(248,209,23,0.1)] text-[var(--color-accent)]'
              : 'border-[var(--color-line)] bg-[var(--color-surface)] text-[#C9C9CE]'
          }`}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
            <path d="M4 7h9" /><path d="M19 7h1" /><circle cx="16" cy="7" r="2.4" />
            <path d="M4 17h4" /><path d="M14 17h6" /><circle cx="11" cy="17" r="2.4" />
          </svg>
          Filter
          {activeCount > 0 ? (
            <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--color-accent)] px-1 font-mono text-[10px] font-semibold text-[var(--color-on-accent)]">
              {activeCount}
            </span>
          ) : null}
        </button>
      </div>

      {open ? (
        <div className="mt-3 rounded-[15px] border border-[var(--color-line)] bg-[#17171A] p-4">
          <Group label="Type of bet">
            <Chip on={betType === 'all'} onClick={() => apply('type', 'all')}>
              All picks
            </Chip>
            {BET_TYPES.map((b) => (
              <Chip key={b.value} on={betType === b.value} onClick={() => apply('type', b.value)}>
                {b.label}
              </Chip>
            ))}
          </Group>

          <Group label="Posted">
            {TIME_RANGES.map((t) => (
              <Chip key={t.value} on={range === t.value} onClick={() => apply('range', t.value)}>
                {t.label}
              </Chip>
            ))}
          </Group>

          <div className="mt-4 flex gap-[9px]">
            <button
              type="button"
              onClick={reset}
              className="h-11 flex-1 rounded-[12px] border border-[var(--color-line)] bg-[var(--color-surface-3)] text-[13px] font-medium text-[var(--color-ink-2)]"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-11 flex-[1.4] rounded-[12px] bg-[var(--color-accent)] text-[13px] font-semibold text-[var(--color-on-accent)]"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="pb-[10px] text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-ink-4)]">
        {label}
      </div>
      <div className="flex flex-wrap gap-[7px]">{children}</div>
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex h-10 items-center rounded-full border px-[14px] text-[12.5px] font-medium ${
        on
          ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-on-accent)]'
          : 'border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-2)]'
      }`}
    >
      {children}
    </button>
  );
}
