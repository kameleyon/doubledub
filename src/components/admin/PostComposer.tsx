'use client';

import { useActionState, useState } from 'react';
import { createPost, type AdminState } from '@/lib/actions/admin';
import { BET_TYPES, type BetType } from '@/lib/feed';

const initial: AdminState = {};

type Leg = { selection: string; market: string; odds: string; units: string };

const emptyLeg: Leg = { selection: '', market: '', odds: '', units: '' };

export function PostComposer() {
  const [state, action, pending] = useActionState(createPost, initial);
  const [kind, setKind] = useState<'slip' | 'text'>('text');
  const [betType, setBetType] = useState<BetType>('single');
  const [legs, setLegs] = useState<Leg[]>([{ ...emptyLeg }]);
  const [gated, setGated] = useState(false);

  function updateLeg(i: number, patch: Partial<Leg>) {
    setLegs((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  return (
    <form action={action} className="flex max-w-[720px] flex-col gap-6">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="betType" value={betType} />
      <input type="hidden" name="minTermDays" value={gated ? 30 : 0} />

      <Field label="Post type">
        <div className="flex gap-[10px]">
          <TypeCard
            on={kind === 'text'}
            onClick={() => setKind('text')}
            title="Text pick"
            sub="Type the selection and odds"
          />
          <TypeCard
            on={kind === 'slip'}
            onClick={() => setKind('slip')}
            title="Betting slip image"
            sub="Upload a screenshot after saving"
          />
        </div>
      </Field>

      <Field label="Bet type">
        <div className="flex flex-wrap gap-[7px]">
          {BET_TYPES.map((b) => (
            <button
              key={b.value}
              type="button"
              onClick={() => setBetType(b.value)}
              className={`inline-flex h-10 items-center rounded-full border px-[15px] text-[12.5px] font-medium ${
                betType === b.value
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                  : 'border-[var(--color-line)] bg-[#17171A] text-[var(--color-ink-2)]'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Headline">
        <input
          name="title"
          maxLength={120}
          placeholder="e.g. Pick of the night"
          className="h-[50px] w-full rounded-[12px] border-[1.5px] border-[var(--color-line)] bg-[#17171A] px-4 text-[14px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-4)] focus:border-[var(--color-accent)]"
        />
      </Field>

      {kind === 'text' ? (
        <Field label="Selections">
          <div className="flex flex-col gap-[10px]">
            {legs.map((leg, i) => (
              <div key={i} className="flex flex-wrap items-center gap-[10px]">
                <span className="w-[22px] flex-shrink-0 font-mono text-[12px] text-[var(--color-ink-4)]">
                  {i + 1}.
                </span>
                <input
                  name={`leg-${i}-selection`}
                  value={leg.selection}
                  onChange={(e) => updateLeg(i, { selection: e.target.value })}
                  placeholder="Selection, e.g. Anthony Edwards Over 26.5 PTS"
                  className="h-[50px] min-w-[220px] flex-1 rounded-[12px] border-[1.5px] border-[var(--color-line)] bg-[#17171A] px-4 text-[14px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-4)] focus:border-[var(--color-accent)]"
                />
                <input
                  name={`leg-${i}-market`}
                  value={leg.market}
                  onChange={(e) => updateLeg(i, { market: e.target.value })}
                  placeholder="Market"
                  className="h-[50px] w-[150px] rounded-[12px] border-[1.5px] border-[var(--color-line)] bg-[#17171A] px-3 text-[14px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-4)] focus:border-[var(--color-accent)]"
                />
                <input
                  name={`leg-${i}-odds`}
                  value={leg.odds}
                  onChange={(e) => updateLeg(i, { odds: e.target.value })}
                  placeholder="Odds"
                  className="h-[50px] w-[92px] rounded-[12px] border-[1.5px] border-[var(--color-line)] bg-[#17171A] px-3 font-mono text-[14px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-4)] focus:border-[var(--color-accent)]"
                />
                <input
                  name={`leg-${i}-units`}
                  value={leg.units}
                  onChange={(e) => updateLeg(i, { units: e.target.value })}
                  placeholder="Units"
                  inputMode="decimal"
                  className="h-[50px] w-[84px] rounded-[12px] border-[1.5px] border-[var(--color-line)] bg-[#17171A] px-3 font-mono text-[14px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-4)] focus:border-[var(--color-accent)]"
                />
                {legs.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setLegs((p) => p.filter((_, idx) => idx !== i))}
                    className="h-[50px] w-11 rounded-[11px] text-[var(--color-ink-2)]"
                    aria-label={`Remove selection ${i + 1}`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mx-auto">
                      <path d="M6 12h12" />
                    </svg>
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setLegs((p) => [...p, { ...emptyLeg }])}
            className="mt-3 flex h-11 items-center gap-2 rounded-[11px] border border-dashed border-[#34343A] bg-[#17171A] px-4 text-[13px] font-medium text-[var(--color-ink-2)]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 6v12M6 12h12" />
            </svg>
            Add another selection
          </button>
        </Field>
      ) : null}

      <Field label="Caption">
        <textarea
          name="caption"
          rows={4}
          maxLength={2000}
          placeholder="Why you like it. This is what members read above the pick."
          className="w-full resize-none rounded-[12px] border-[1.5px] border-[var(--color-line)] bg-[#17171A] p-4 text-[14px] leading-relaxed text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-4)] focus:border-[var(--color-accent)]"
        />
      </Field>

      <div className="flex flex-col gap-3 rounded-[14px] border border-[var(--color-line)] bg-[#17171A] p-4">
        <Toggle
          checked={gated}
          onChange={setGated}
          title="Longer plans only"
          sub="Hide from members on plans shorter than a month"
        />
        <div className="h-px bg-[#26262B]" />
        <label className="flex cursor-pointer items-center gap-3">
          <input type="checkbox" name="pinned" className="h-4 w-4 accent-[var(--color-accent)]" />
          <span className="flex flex-col">
            <span className="text-[13.5px] font-medium">Pin to top of feed</span>
            <span className="text-[11.5px] text-[var(--color-ink-3)]">Stays first for 6 hours</span>
          </span>
        </label>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-[11px] border border-[#4A2725] bg-[#2A1917] px-4 py-3 text-[12.5px] text-[var(--color-bad)]">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          name="publish"
          value="publish"
          disabled={pending}
          className={`flex h-12 items-center rounded-[11px] bg-[var(--color-accent)] px-6 text-[13.5px] font-bold text-[var(--color-on-accent)] ${
            pending ? 'opacity-60' : ''
          }`}
        >
          {pending ? 'Saving…' : kind === 'slip' ? 'Save and add image' : 'Publish now'}
        </button>
        <button
          type="submit"
          name="publish"
          value="draft"
          disabled={pending}
          className="flex h-12 items-center rounded-[11px] border border-[var(--color-line)] bg-[#17171A] px-5 text-[13px] font-medium text-[var(--color-ink-2)]"
        >
          Save as draft
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="pb-[11px] text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-ink-4)]">
        {label}
      </div>
      {children}
    </div>
  );
}

function TypeCard({
  on, onClick, title, sub,
}: { on: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 flex-col gap-1 rounded-[14px] border-[1.5px] p-4 text-left ${
        on
          ? 'border-[var(--color-accent)] bg-[rgba(248,209,23,0.07)] text-[var(--color-accent)]'
          : 'border-[#26262B] bg-[#17171A] text-[var(--color-ink-2)]'
      }`}
    >
      <span className="text-[13.5px] font-bold">{title}</span>
      <span className="text-[11.5px] opacity-75">{sub}</span>
    </button>
  );
}

function Toggle({
  checked, onChange, title, sub,
}: { checked: boolean; onChange: (v: boolean) => void; title: string; sub: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-3 text-left">
      <span
        className={`flex h-[26px] w-[44px] flex-shrink-0 items-center rounded-full p-[3px] ${
          checked ? 'justify-end bg-[var(--color-accent)]' : 'justify-start bg-[#33333A]'
        }`}
      >
        <span className="h-5 w-5 rounded-full bg-white" />
      </span>
      <span className="flex flex-col">
        <span className="text-[13.5px] font-medium">{title}</span>
        <span className="text-[11.5px] text-[var(--color-ink-3)]">{sub}</span>
      </span>
    </button>
  );
}
