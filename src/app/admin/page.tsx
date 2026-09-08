import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/server';
import { BET_TYPE_LABEL, relativeTime, type BetType } from '@/lib/feed';
import { PostRowActions } from '@/components/admin/PostRowActions';

export default async function AdminPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; updated?: string }>;
}) {
  const { created, updated } = await searchParams;
  const db = createAdminClient();

  const [{ data: posts }, { count: members }] = await Promise.all([
    db
      .from('posts')
      .select('id, kind, bet_type, title, caption, status, published_at, like_count, view_count')
      .order('created_at', { ascending: false })
      .limit(50),
    db.from('subscriptions').select('user_id', { count: 'exact', head: true }).in('status', ['active', 'trialing']),
  ]);

  const rows = posts ?? [];
  const live = rows.filter((p) => p.status === 'published').length;

  return (
    <main className="flex-1 px-6 py-7 md:px-8">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex-1">
          <h1 className="text-[22px] font-bold tracking-[-0.03em]">Posts</h1>
          <p className="mt-1 text-[12.5px] text-[var(--color-ink-3)]">
            {live} live &middot; {rows.length - live} draft &middot; {members ?? 0} active member
            {members === 1 ? '' : 's'}
          </p>
        </div>
        <Link
          href="/admin/new"
          className="flex h-11 items-center rounded-[11px] bg-[var(--color-accent)] px-5 text-[13.5px] font-bold text-[var(--color-on-accent)] no-underline"
        >
          New post
        </Link>
      </div>

      {created || updated ? (
        <p className="mt-5 rounded-[11px] border border-[#22402F] bg-[#16241D] px-4 py-3 text-[12.5px] text-[var(--color-good)]">
          {created ? 'Post created.' : 'Changes saved.'}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-10 text-[13px] text-[var(--color-ink-3)]">
          Nothing posted yet. <Link href="/admin/new">Write the first pick</Link>.
        </p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-[16px] border border-[#232327] bg-[#17171A]">
          {rows.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-4 border-b border-[#202024] px-5 py-4 last:border-b-0">
              <span
                className={`w-[76px] flex-shrink-0 rounded-[6px] px-2 py-1 text-center text-[9.5px] font-bold uppercase tracking-[0.06em] ${
                  p.status === 'published'
                    ? 'bg-[rgba(63,191,127,0.12)] text-[var(--color-good)]'
                    : 'bg-[#26262B] text-[var(--color-ink-2)]'
                }`}
              >
                {p.status}
              </span>
              <span className="rounded-[6px] bg-[rgba(248,209,23,0.13)] px-2 py-1 text-[9.5px] font-bold uppercase tracking-[0.06em] text-[var(--color-accent)]">
                {BET_TYPE_LABEL[p.bet_type as BetType] ?? p.bet_type}
              </span>
              <span className="min-w-[180px] flex-1 truncate text-[13.5px] font-medium">
                {p.title || p.caption?.slice(0, 60) || 'Untitled'}
              </span>
              <span className="font-mono text-[12px] text-[var(--color-ink-3)]">
                {p.view_count}v &middot; {p.like_count}l
              </span>
              <span className="w-[92px] text-right text-[12px] text-[var(--color-ink-4)]">
                {p.published_at ? relativeTime(p.published_at) : 'draft'}
              </span>
              <PostRowActions id={p.id} published={p.status === 'published'} />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
