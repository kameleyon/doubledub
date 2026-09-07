import { PostComposer } from '@/components/admin/PostComposer';

export default function NewPostPage() {
  return (
    <main className="flex-1 px-6 py-7 md:px-8">
      <h1 className="text-[22px] font-bold tracking-[-0.03em]">New post</h1>
      <p className="mt-1 text-[12.5px] text-[var(--color-ink-3)]">
        Picks are grouped by bet type across every sport.
      </p>
      <div className="mt-7">
        <PostComposer />
      </div>
    </main>
  );
}
