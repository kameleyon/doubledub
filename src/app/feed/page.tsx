import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, getEntitlement } from '@/lib/auth';
import { getFeed } from '@/lib/posts';
import { PostCard } from '@/components/PostCard';
import { BottomNav } from '@/components/BottomNav';
import { LeagueFilter } from '@/components/LeagueFilter';

export const metadata: Metadata = { title: 'Feed' };
export const dynamic = 'force-dynamic';

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string; welcome?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in?next=%2Ffeed');

  // The paywall. RLS would return an empty feed anyway, but an explicit
  // redirect is the difference between "you need to subscribe" and a screen
  // that just looks broken.
  const entitlement = await getEntitlement();
  if (!entitlement.active) redirect('/membership');

  const { league, welcome } = await searchParams;
  const posts = await getFeed({ league });

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[440px] flex-col overflow-hidden">
      <header className="flex flex-shrink-0 items-center justify-between px-[18px] pt-[22px] pb-[14px]">
        <div className="flex items-baseline gap-2">
          <span className="text-[21px] font-bold tracking-[-0.05em] text-[var(--color-accent)]">
            doubledub
          </span>
          <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-3)]">
            Feed
          </span>
        </div>
        <Link
          href="/profile"
          className="flex h-[34px] w-[34px] items-center justify-center rounded-full border-[1.5px] border-[#3D3D45] bg-[var(--color-surface-3)] text-[12px] font-semibold text-[#C9C9CE] no-underline"
        >
          {(user.email ?? 'M').slice(0, 2).toUpperCase()}
        </Link>
      </header>

      <Suspense fallback={<div className="h-[60px]" />}>
        <LeagueFilter />
      </Suspense>

      <div className="dd-scroll flex flex-1 flex-col gap-[14px] overflow-y-auto px-[18px] pb-5">
        {welcome ? (
          <p className="rounded-[13px] border border-[#3B3620] bg-[rgba(248,209,23,0.06)] px-4 py-3 text-[12.5px] text-[var(--color-accent)]">
            You&rsquo;re in. Every new pick lands here the moment it posts.
          </p>
        ) : null}

        {posts.length === 0 ? (
          <EmptyFeed filtered={Boolean(league && league !== 'All')} />
        ) : (
          posts.map((post) => <PostCard key={post.id} post={post} />)
        )}
      </div>

      <BottomNav active="/feed" />
    </div>
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
        {filtered ? 'Nothing in this league yet' : 'No picks yet'}
      </span>
      <span className="max-w-[240px] text-[12.5px] leading-relaxed text-[var(--color-ink-4)] text-pretty">
        {filtered
          ? 'Try another league — new picks post throughout the day.'
          : 'The first pick will appear here the moment it posts.'}
      </span>
    </div>
  );
}
