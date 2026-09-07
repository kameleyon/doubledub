import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/server';
import { BET_TYPE_LABEL, type BetType } from '@/lib/feed';
import { SlipUploader } from '@/components/admin/SlipUploader';

export default async function AdminPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createAdminClient();

  const { data: post } = await db
    .from('posts')
    .select('id, kind, bet_type, title, caption, status, published_at, min_term_days')
    .eq('id', id)
    .maybeSingle();

  if (!post) notFound();

  const [{ data: media }, { data: legs }] = await Promise.all([
    db.from('post_media').select('id, byte_size').eq('post_id', id),
    db.from('post_legs').select('selection, market, odds, units').eq('post_id', id).order('position'),
  ]);

  return (
    <main className="flex-1 px-6 py-7 md:px-8">
      <Link href="/admin" className="text-[12.5px] text-[var(--color-ink-3)] no-underline">
        &larr; All posts
      </Link>

      <h1 className="mt-3 text-[22px] font-bold tracking-[-0.03em]">
        {post.title || 'Untitled post'}
      </h1>
      <p className="mt-1 text-[12.5px] text-[var(--color-ink-3)]">
        {post.status} &middot; {BET_TYPE_LABEL[post.bet_type as BetType] ?? post.bet_type} &middot;{' '}
        {post.min_term_days > 0 ? 'longer plans only' : 'all members'}
      </p>

      {post.caption ? (
        <p className="mt-5 max-w-[640px] text-[14px] leading-relaxed text-[var(--color-ink-2)]">
          {post.caption}
        </p>
      ) : null}

      {legs?.length ? (
        <div className="mt-5 max-w-[640px] rounded-[14px] border border-[#26262B] bg-[#17171A] p-4">
          {legs.map((l, i) => (
            <div key={i} className="flex items-center justify-between gap-4 py-2">
              <span className="flex flex-col">
                <span className="text-[13.5px] font-medium">{l.selection}</span>
                {l.market ? (
                  <span className="text-[11.5px] text-[var(--color-ink-3)]">{l.market}</span>
                ) : null}
              </span>
              <span className="font-mono text-[13px] text-[var(--color-accent)]">{l.odds}</span>
            </div>
          ))}
        </div>
      ) : null}

      {post.kind === 'slip' ? (
        <section className="mt-8 max-w-[640px]">
          <div className="pb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-ink-4)]">
            Slip image
          </div>
          {media?.length ? (
            <p className="rounded-[12px] border border-[var(--color-line)] bg-[#17171A] px-4 py-3 text-[12.5px] text-[var(--color-good)]">
              Image attached ({Math.round((media[0].byte_size ?? 0) / 1024)} KB). Members see it
              through a short-lived signed URL, never a permanent one.
            </p>
          ) : (
            <SlipUploader postId={post.id} />
          )}
        </section>
      ) : null}
    </main>
  );
}
