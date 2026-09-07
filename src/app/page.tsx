import Image from 'next/image';
import Link from 'next/link';

/**
 * Public landing shell. Deliberately minimal — the member screens are the next
 * piece of work; this exists so the app boots and the paywall has somewhere to
 * send a signed-out visitor.
 */
export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 text-center">
      <Image src="/ddlogo.png" alt="doubledub" width={280} height={93} priority />
      <p className="max-w-sm text-sm leading-relaxed text-[var(--color-ink-2)]">
        Members-only betting picks. Every pick the second it drops.
      </p>
      <Link
        href="/sign-in"
        className="flex h-14 w-full max-w-xs items-center justify-center rounded-[14px] bg-[var(--color-accent)] text-[15px] font-bold text-[var(--color-on-accent)]"
      >
        Sign in
      </Link>
      <p className="max-w-sm text-[11px] leading-relaxed text-[var(--color-ink-4)]">
        doubledub publishes information and opinion only and does not accept wagers. 21+ only. If
        you or someone you know has a gambling problem, call 1-800-GAMBLER.
      </p>
    </main>
  );
}
