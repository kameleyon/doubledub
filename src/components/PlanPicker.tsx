'use client';

import { useState } from 'react';
import { PLANS, formatPrice, perDayPrice, type PlanCode } from '@/lib/plans';

const SERVICE_FEE_CENTS = 113;

export function PlanPicker({ defaultPlan = 'dd_1m' }: { defaultPlan?: PlanCode }) {
  const [selected, setSelected] = useState<PlanCode>(defaultPlan);
  const [promo, setPromo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = PLANS.find((p) => p.code === selected)!;
  const discount = promo ? Math.round(plan.amountCents * 0.5) : 0;
  const total = plan.amountCents - discount + SERVICE_FEE_CENTS;

  async function checkout() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ planCode: selected }),
      });
      const body = await res.json();
      if (!res.ok || !body.url) {
        setError(body.error ?? 'Could not start checkout.');
        setBusy(false);
        return;
      }
      // Full navigation, not a router push — this leaves the app for Stripe.
      window.location.href = body.url;
    } catch {
      setError('Network problem. Try again.');
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-[9px]">
        {PLANS.map((p) => {
          const on = p.code === selected;
          return (
            <button
              key={p.code}
              type="button"
              onClick={() => setSelected(p.code)}
              className={`flex min-h-[66px] w-full items-center gap-[13px] rounded-[14px] border-[1.5px] px-[15px] py-[13px] text-left transition-colors ${
                on
                  ? 'border-[var(--color-accent)] bg-[rgba(248,209,23,0.07)]'
                  : 'border-[#26262B] bg-[var(--color-surface)]'
              }`}
            >
              <span
                aria-hidden
                className={`flex h-[21px] w-[21px] flex-shrink-0 items-center justify-center rounded-full border-2 ${
                  on ? 'border-[var(--color-accent)]' : 'border-[#3D3D45]'
                }`}
              >
                {on ? <span className="h-[10px] w-[10px] rounded-full bg-[var(--color-accent)]" /> : null}
              </span>

              <span className="flex flex-1 flex-col gap-[3px]">
                <span className="flex items-center gap-[7px]">
                  <span className="text-[14.5px] font-semibold tracking-[-0.015em] text-[var(--color-ink)]">
                    {p.label}
                  </span>
                  {p.badge ? (
                    <span className="rounded-[5px] bg-[rgba(248,209,23,0.13)] px-[7px] py-[3px] text-[8.5px] font-bold uppercase tracking-[0.11em] text-[var(--color-accent)]">
                      {p.badge}
                    </span>
                  ) : null}
                </span>
                <span className="font-mono text-[11px] text-[var(--color-ink-3)]">
                  {perDayPrice(p)} / day
                </span>
              </span>

              <span className="flex flex-col items-end gap-[3px]">
                <span
                  className={`font-mono text-[14.5px] font-medium ${
                    on ? 'text-[var(--color-accent)]' : 'text-[var(--color-ink)]'
                  }`}
                >
                  {formatPrice(p.amountCents)}
                </span>
                <span className="font-mono text-[11px] text-[var(--color-ink-4)] line-through">
                  {formatPrice(p.listAmountCents)}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex min-h-[52px] items-center gap-[10px] rounded-[13px] border border-dashed border-[#34343A] bg-[var(--color-surface)] px-[14px]">
        <span className={`flex-1 text-[13px] font-semibold ${promo ? 'text-[var(--color-good)]' : 'text-[var(--color-ink-2)]'}`}>
          {promo ? 'DUB50 applied — 50% off your first term' : 'Have a promo code?'}
        </span>
        <button
          type="button"
          onClick={() => setPromo((v) => !v)}
          className="h-11 text-[12.5px] font-medium text-[var(--color-ink-2)]"
        >
          {promo ? 'Remove' : 'Apply'}
        </button>
      </div>

      <div className="mt-[18px] rounded-[14px] border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-[15px]">
        <Row label={`${plan.label} access`} value={formatPrice(plan.amountCents)} />
        <Row
          label={promo ? 'Promo DUB50' : 'No promo applied'}
          value={promo ? `-${formatPrice(discount)}` : '$0.00'}
          tone={promo ? 'good' : 'muted'}
        />
        <Row label="Service fee" value={formatPrice(SERVICE_FEE_CENTS)} />
        <div className="my-[13px] h-px bg-[var(--color-line)]" />
        <div className="flex items-baseline justify-between">
          <span className="text-[14px] font-semibold tracking-[-0.015em]">Total due today</span>
          <span className="font-mono text-[21px] font-medium tracking-[-0.02em] text-[var(--color-accent)]">
            {formatPrice(total)}
          </span>
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
          After {plan.label}, renews automatically at {formatPrice(plan.amountCents)} plus a{' '}
          {formatPrice(SERVICE_FEE_CENTS)} service fee every {plan.label}.
        </p>
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-[11px] border border-[#4A2725] bg-[#2A1917] px-4 py-3 text-[12.5px] text-[var(--color-bad)]">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={checkout}
        disabled={busy}
        className={`mt-5 flex h-14 w-full items-center justify-center rounded-[14px] bg-[var(--color-accent)] text-[15px] font-bold tracking-[-0.02em] text-[var(--color-on-accent)] ${
          busy ? 'opacity-60' : ''
        }`}
      >
        {busy ? 'Opening checkout…' : `Start ${plan.label} — ${formatPrice(total)}`}
      </button>

      <div className="mt-3 flex items-center justify-center gap-[6px]">
        <span className="text-[10.5px] text-[var(--color-ink-4)]">Secured by</span>
        <span className="text-[12px] font-bold tracking-[-0.04em] text-[#7A7A82]">stripe</span>
      </div>
    </>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'muted' }) {
  const color =
    tone === 'good' ? 'text-[var(--color-good)]' : tone === 'muted' ? 'text-[var(--color-ink-3)]' : '';
  return (
    <div className={`flex items-center justify-between ${tone ? 'mt-[9px]' : 'first:mt-0 mt-[9px]'}`}>
      <span className={`text-[13px] ${color || 'text-[var(--color-ink-2)]'}`}>{label}</span>
      <span className={`font-mono text-[13px] ${color || 'text-[#C9C9CE]'}`}>{value}</span>
    </div>
  );
}
