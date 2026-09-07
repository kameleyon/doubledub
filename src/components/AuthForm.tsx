'use client';

import { useActionState, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { authenticate, type AuthState } from '@/lib/actions/auth';

const initial: AuthState = {};

export function AuthForm({ mode, next }: { mode: 'signin' | 'signup'; next?: string }) {
  // Local rather than route-derived: the tab has to flip on the same tick as
  // the click. Navigating first meant a server round trip during which nothing
  // changed on screen, which reads as a dead button.
  const [current, setCurrent] = useState(mode);
  const isSignup = current === 'signup';
  const [state, action, pending] = useActionState(authenticate, initial);

  // Keep the address bar honest without re-rendering from the server.
  function switchTo(next: 'signin' | 'signup') {
    if (next === current) return;
    setCurrent(next);
    window.history.replaceState(null, '', next === 'signup' ? '/sign-up' : '/sign-in');
  }
  const [reveal, setReveal] = useState(false);
  const [age, setAge] = useState(false);

  const ready = !isSignup || age;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col px-7 pt-14 pb-8">
      <div className="flex flex-col items-center gap-4">
        <Image src="/ddlogo.png" alt="doubledub" width={220} height={73} priority className="h-auto w-[220px]" />
        <span className="text-[9.5px] font-semibold tracking-[0.34em] text-[var(--color-ink-3)]">
          BETTER PICKS&nbsp; BIGGER WINS
        </span>
      </div>

      <div className="mt-9 flex gap-1 rounded-[14px] border border-[var(--color-line)] bg-[var(--color-surface)] p-1">
        <button
          type="button"
          onClick={() => switchTo('signup')}
          className={`h-11 flex-1 rounded-[11px] text-[13.5px] font-semibold transition-colors ${
            isSignup
              ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
              : 'text-[var(--color-ink-2)]'
          }`}
        >
          Create account
        </button>
        <button
          type="button"
          onClick={() => switchTo('signin')}
          className={`h-11 flex-1 rounded-[11px] text-[13.5px] font-semibold transition-colors ${
            !isSignup
              ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
              : 'text-[var(--color-ink-2)]'
          }`}
        >
          Log in
        </button>
      </div>

      <form action={action} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="mode" value={current} />
        {next ? <input type="hidden" name="next" value={next} /> : null}

        <label className="flex flex-col gap-2">
          <span className="text-[11.5px] font-medium text-[var(--color-ink-2)]">Email address</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            className="h-[54px] rounded-[13px] border-[1.5px] border-[var(--color-line)] bg-[var(--color-surface)] px-4 text-[14.5px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-4)] focus:border-[var(--color-accent)]"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="flex items-center justify-between">
            <span className="text-[11.5px] font-medium text-[var(--color-ink-2)]">
              {isSignup ? 'Create a password' : 'Password'}
            </span>
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              className="text-[11.5px] font-medium text-[var(--color-ink-3)]"
            >
              {reveal ? 'Hide' : 'Show'}
            </button>
          </span>
          <input
            name="password"
            type={reveal ? 'text' : 'password'}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
            minLength={8}
            placeholder={isSignup ? 'At least 8 characters' : 'Enter your password'}
            className="h-[54px] rounded-[13px] border-[1.5px] border-[var(--color-line)] bg-[var(--color-surface)] px-4 text-[14.5px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-4)] focus:border-[var(--color-accent)]"
          />
        </label>

        {isSignup ? (
          <label className="flex cursor-pointer items-start gap-3 py-1">
            <input
              name="age"
              type="checkbox"
              checked={age}
              onChange={(e) => setAge(e.target.checked)}
              className="sr-only"
            />
            <span
              aria-hidden
              className={`mt-[1px] flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-[7px] border-[1.5px] ${
                age
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)]'
                  : 'border-[#3D3D45] bg-[var(--color-surface)]'
              }`}
            >
              {age ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-on-accent)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4.5 12.6 9.6 17.7 19.5 6.9" />
                </svg>
              ) : null}
            </span>
            <span className="text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
              I am 21 or older and I accept the <Link href="/legal/terms">Terms</Link> and{' '}
              <Link href="/legal/privacy">Privacy Policy</Link>.
            </span>
          </label>
        ) : null}

        {state.error ? (
          <p
            role="alert"
            className="rounded-[11px] border border-[#4A2725] bg-[#2A1917] px-4 py-3 text-[12.5px] text-[var(--color-bad)]"
          >
            {state.error}
          </p>
        ) : null}

        {state.notice ? (
          <p
            role="status"
            className="rounded-[11px] border border-[#22402F] bg-[#16241D] px-4 py-3 text-[12.5px] text-[var(--color-good)]"
          >
            {state.notice}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!ready || pending}
          className={`mt-1 flex h-14 items-center justify-center rounded-[14px] text-[15px] font-bold transition-opacity ${
            ready
              ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
              : 'bg-[var(--color-surface-3)] text-[var(--color-ink-4)]'
          } ${pending ? 'opacity-60' : ''}`}
        >
          {pending ? 'One moment…' : isSignup ? 'Create account' : 'Log in'}
        </button>
      </form>

      {!isSignup ? (
        <Link
          href="/reset-password"
          className="mt-4 self-center text-[12.5px] font-medium text-[var(--color-ink-2)] no-underline"
        >
          Forgot password?
        </Link>
      ) : null}

      <p className="mt-auto pt-10 text-center text-[10.5px] leading-relaxed text-[var(--color-ink-4)]">
        doubledub publishes information and opinion only and does not accept wagers. 21+ only. If
        you or someone you know has a gambling problem, call 1-800-GAMBLER.
      </p>
    </main>
  );
}
