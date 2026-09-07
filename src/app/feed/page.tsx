import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser, getEntitlement } from '@/lib/auth';
import { getFeed } from '@/lib/posts';
import { PostCard } from '@/components/PostCard';
import { BottomNav } from '@/components/BottomNav';
import Image from 'next/image';
import { FeedControls } from '@/components/FeedControls';

export const metadata: Metadata = { title: 'Feed' };
export const dynamic = 'force-dynamic';

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; range?: string; welcome?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in?next=%2Ffeed');

  // The paywall. RLS would return an empty feed anyway, but an explicit
  // redirect is the difference between "you need to subscribe" and a screen
  // that just looks broken.
  const { type, range, welcome } = await searchParams;
  const entitlement = await getEntitlement();

  // Stripe returns the member here the instant checkout completes, which is
  // often BEFORE the webhook has written the entitlement. Redirecting to the
  // paywall at that moment tells someone who just paid that they have not —
  // so hold them on a short confirming screen instead.
  if (!entitlement.active) {
    if (welcome) return <ActivatingMembership />;
    redirect('/membership');
  }
  const posts = await getFeed({ betType: type, range });

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[440px] flex-col overflow-hidden">
      <header className="flex flex-shrink-0 items-center gap-2 px-[18px] pt-[22px] pb-[14px]">
        <Image
          src="/ddlogo.png"
          alt="doubledub"
          width={132}
          height={44}
          priority
          className="h-auto w-[132px]"
        />
        <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-3)]">
          Feed
        </span>
      </header>

      <Suspense fallback={<div className="h-[60px]" />}>
        <FeedControls />
      </Suspense>

      <div className="dd-scroll flex flex-1 flex-col gap-[14px] overflow-y-auto px-[18px] pb-5">
        {welcome ? (
          <p className="rounded-[13px] border border-[#3B3620] bg-[rgba(248,209,23,0.06)] px-4 py-3 text-[12.5px] text-[var(--color-accent)]">
            You&rsquo;re in. Every new pick lands here the moment it posts.
          </p>
        ) : null}

        {posts.length === 0 ? (
          <EmptyFeed filtered={Boolean((type && type !== 'all') || (range && range !== 'all'))} />
        ) : (
          posts.map((post) => <PostCard key={post.id} post={post} />)
        )}
      </div>

      <BottomNav active="/feed" />
    </div>
  );
}

function ActivatingMembership() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col items-center justify-center gap-5 px-8 text-center">
      {/* Meta refresh rather than a client poll: no JavaScript required, and it
          cannot spin forever the way a bad retry loop can. */}
      <meta httpEquiv="refresh" content="3" />
      <span className="h-9 w-9 animate-spin rounded-full border-2 border-[var(--color-line)] border-t-[var(--color-accent)]" />
      <h1 className="text-[18px] font-bold tracking-[-0.02em]">Confirming your payment</h1>
      <p className="text-[13px] leading-relaxed text-[var(--color-ink-2)] text-pretty">
        This usually takes a few seconds. The page will refresh on its own — you do not need to pay
        again.
      </p>
      <a href="/membership" className="text-[12.5px] text-[var(--color-ink-3)]">
        Taking too long? Check your membership
      </a>
    </main>
  );
}

function EmptyFeed({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
      <span className="flex h-[52px] w-[52px] items-center justify-center rounded-[16px] border border-[var(--color-line)] bg-[var(--color-surface)]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#55555C" strokeWidth="1.9" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="7.5" rx="2.4" />
          <rect x="3" y="14" width="18" height="6" rx="2.2" />
        </svg>
      </span>
      <span className="text-[14px] font-semibold text-[var(--color-ink-2)]">
        {filtered ? 'Nothing of that type yet' : 'No picks yet'}
      </span>
      <span className="max-w-[240px] text-[12.5px] leading-relaxed text-[var(--color-ink-4)] text-pretty">
        {filtered
          ? 'Try another bet type — new picks post throughout the day.'
          : 'The first pick will appear here the moment it posts.'}
      </span>
    </div>
  );
}
