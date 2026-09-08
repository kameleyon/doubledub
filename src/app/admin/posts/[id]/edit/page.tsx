import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/server';
import { PostComposer, type ExistingPost } from '@/components/admin/PostComposer';
import type { BetType } from '@/lib/feed';

export const dynamic = 'force-dynamic';

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createAdminClient();

  const { data: post } = await db
    .from('posts')
    .select('id, kind, bet_type, title, caption, status, min_term_days, pinned_until')
    .eq('id', id)
    .maybeSingle();

  if (!post) notFound();

  const { data: media } = await db
    .from('post_media')
    .select('storage_path')
    .eq('post_id', id)
    .limit(1);

  // The bucket is private, so the editor needs its own signed URL to show the
  // current image. Short-lived, same as the member feed.
  let imageUrl: string | null = null;
  if (media?.[0]) {
    const { data: signed } = await db.storage.from('slips').createSignedUrl(media[0].storage_path, 300);
    imageUrl = signed?.signedUrl ?? null;
  }

  const existing: ExistingPost = {
    id: post.id,
    kind: post.kind,
    betType: post.bet_type as BetType,
    title: post.title,
    caption: post.caption,
    minTermDays: post.min_term_days,
    published: post.status === 'published',
    pinned: Boolean(post.pinned_until && new Date(post.pinned_until) > new Date()),
    imageUrl,
  };

  return (
    <main className="flex-1 px-6 py-7 md:px-8">
      <Link href="/admin" className="text-[12.5px] text-[var(--color-ink-3)] no-underline">
        &larr; All posts
      </Link>
      <h1 className="mt-3 text-[22px] font-bold tracking-[-0.03em]">Edit post</h1>
      <p className="mt-1 text-[12.5px] text-[var(--color-ink-3)]">
        Editing keeps the original publish time, so a correction will not jump back to the top of
        the feed.
      </p>
      <div className="mt-7">
        <PostComposer existing={existing} />
      </div>
    </main>
  );
}
