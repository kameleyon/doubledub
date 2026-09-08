'use client';

import { useActionState, useState } from 'react';
import { createPost, updatePost, type AdminState } from '@/lib/actions/admin';
import { BET_TYPES, BET_TYPE_LABEL, type BetType } from '@/lib/feed';
import { SlipDropzone } from '@/components/admin/SlipDropzone';

const initial: AdminState = {};

export type ExistingPost = {
  id: string;
  kind: 'slip' | 'text';
  betType: BetType;
  title: string;
  caption: string;
  minTermDays: number;
  published: boolean;
  pinned: boolean;
  imageUrl: string | null;
};

export function PostComposer({ existing }: { existing?: ExistingPost }) {
  const editing = Boolean(existing);
  const [state, action, pending] = useActionState(editing ? updatePost : createPost, initial);

  const [kind, setKind] = useState<'slip' | 'text'>(existing?.kind ?? 'text');
  const [betType, setBetType] = useState<BetType>(existing?.betType ?? 'single');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [caption, setCaption] = useState(existing?.caption ?? '');
  const [gated, setGated] = useState((existing?.minTermDays ?? 0) > 0);
  const [pinned, setPinned] = useState(existing?.pinned ?? false);
  const [slipPreview, setSlipPreview] = useState<string | null>(existing?.imageUrl ?? null);

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <form action={action} className="flex min-w-0 max-w-[680px] flex-1 flex-col gap-6">
        {existing ? <input type="hidden" name="postId" value={existing.id} /> : null}
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="betType" value={betType} />
        <input type="hidden" name="minTermDays" value={gated ? 30 : 0} />

        <Field label="Post type">
          <div className="flex flex-wrap gap-[10px]">
            <TypeCard on={kind === 'text'} onClick={() => setKind('text')} title="Text pick" sub="Type the selection and odds" />
            <TypeCard on={kind === 'slip'} onClick={() => setKind('slip')} title="Betting slip image" sub="Paste or drop a screenshot" />
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
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="e.g. Pick of the night"
            className="h-[50px] w-full rounded-[12px] border-[1.5px] border-[var(--color-line)] bg-[#17171A] px-4 text-[14px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-4)] focus:border-[var(--color-accent)]"
          />
        </Field>

        {kind === 'slip' ? (
          <Field label="Slip screenshot">
            <SlipDropzone existingUrl={existing?.imageUrl ?? null} onChangeAction={(f) => setSlipPreview(f ? 'pending' : null)} />
          </Field>
        ) : null}

        <Field label="Caption">
          <textarea
            name="caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Why you like it. This is what members read above the pick."
            className="w-full resize-none rounded-[12px] border-[1.5px] border-[var(--color-line)] bg-[#17171A] p-4 text-[14px] leading-relaxed text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-4)] focus:border-[var(--color-accent)]"
          />
        </Field>

        <div className="flex flex-col gap-3 rounded-[14px] border border-[var(--color-line)] bg-[#17171A] p-4">
          <Toggle checked={gated} onChange={setGated} title="Longer plans only" sub="Hide from members on plans shorter than a month" />
          <div className="h-px bg-[#26262B]" />
          <label className="flex items-center gap-3">
            <input type="checkbox" name="pinned" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
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
            className={`flex h-12 items-center rounded-[11px] bg-[var(--color-accent)] px-6 text-[13.5px] font-bold text-[var(--color-on-accent)] ${pending ? 'opacity-60' : ''}`}
          >
            {pending ? 'Saving…' : editing ? 'Save and publish' : 'Publish now'}
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

      {/* Live preview: the same card shape members get, so a bad caption or a
          missing selection is visible before it is published rather than after. */}
      <aside aria-label="Post preview" className="w-full max-w-[400px] flex-shrink-0">
        <div className="pb-[11px] text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-ink-4)]">
          How members will see it
        </div>
        <div className="rounded-[20px] border border-[#26262B] bg-[#17171A] p-4">
          <article className="rounded-[16px] border border-[var(--color-line)] bg-[var(--color-surface)]">
            <header className="flex items-center gap-2 px-[14px] pt-[14px]">
              <span className="rounded-[6px] bg-[var(--color-surface-3)] px-2 py-[3px] text-[10px] font-semibold tracking-[0.07em] text-[var(--color-ink-2)]">
                {BET_TYPE_LABEL[betType]}
              </span>
              <span className={`rounded-[6px] px-2 py-[3px] text-[10px] font-semibold tracking-[0.07em] ${kind === 'slip' ? 'bg-[rgba(248,209,23,0.13)] text-[var(--color-accent)]' : 'bg-[var(--color-surface-3)] text-[var(--color-ink-2)]'}`}>
                {kind === 'slip' ? 'Slip' : 'Pick'}
              </span>
              {pinned ? (
                <span className="rounded-[6px] bg-[var(--color-surface-3)] px-2 py-[3px] text-[10px] font-semibold tracking-[0.07em] text-[var(--color-ink-3)]">
                  Pinned
                </span>
              ) : null}
              <span className="flex-1" />
              <span className="text-[11.5px] text-[var(--color-ink-3)]">just now</span>
            </header>

            {title ? (
              <div className="px-[14px] pt-[11px] text-[9.5px] font-bold uppercase tracking-[0.15em] text-[var(--color-accent)]">
                {title}
              </div>
            ) : null}

            {caption ? (
              <p className="px-[14px] pt-[9px] text-[13.5px] leading-relaxed text-[#B6B6BC]">{caption}</p>
            ) : (
              <p className="px-[14px] pt-[9px] text-[13.5px] italic leading-relaxed text-[var(--color-ink-4)]">
                Your caption appears here.
              </p>
            )}

            {kind === 'slip' ? (
              <div className="mx-[14px] mt-[13px] flex h-[120px] items-center justify-center rounded-[12px] border border-[#3A3A41] bg-[#101014] text-[12px] text-[var(--color-ink-4)]">
                {slipPreview ? 'Slip screenshot' : 'No screenshot yet'}
              </div>
            ) : null}

            <footer className="mt-[13px] flex items-center gap-[7px] border-t border-[#232327] px-[14px] py-[13px] text-[12.5px] font-medium text-[#8C8C93]">
              <span className="flex items-center gap-[6px]">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                  <path d="M20.7 8.7c0 4.7-8.7 9.6-8.7 9.6S3.3 13.4 3.3 8.7A4.6 4.6 0 0 1 12 6.8a4.6 4.6 0 0 1 8.7 1.9Z" />
                </svg>
                0
              </span>
              <span className="flex items-center gap-[5px] text-[#5B5B62]">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M5 19v-4.5" /><path d="M11 19V9" /><path d="M17 19V4.5" />
                </svg>
                0 views
              </span>
            </footer>
          </article>

          {gated ? (
            <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
              Only members on a one month plan or longer will see this.
            </p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="pb-[11px] text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-ink-4)]">{label}</div>
      {children}
    </div>
  );
}

function TypeCard({ on, onClick, title, sub }: { on: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-[200px] flex-1 flex-col gap-1 rounded-[14px] border-[1.5px] p-4 text-left ${
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

function Toggle({ checked, onChange, title, sub }: { checked: boolean; onChange: (v: boolean) => void; title: string; sub: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-3 text-left">
      <span className={`flex h-[26px] w-[44px] flex-shrink-0 items-center rounded-full p-[3px] ${checked ? 'justify-end bg-[var(--color-accent)]' : 'justify-start bg-[#33333A]'}`}>
        <span className="h-5 w-5 rounded-full bg-white" />
      </span>
      <span className="flex flex-col">
        <span className="text-[13.5px] font-medium">{title}</span>
        <span className="text-[11.5px] text-[var(--color-ink-3)]">{sub}</span>
      </span>
    </button>
  );
}
