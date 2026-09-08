'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { deletePost, setPostStatus } from '@/lib/actions/admin';

export function PostRowActions({ id, published }: { id: string; published: boolean }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex items-center gap-3">
      {error ? <span className="text-[11.5px] text-[var(--color-bad)]">{error}</span> : null}

      <Link href={`/admin/posts/${id}/edit`} className="text-[12.5px] font-medium no-underline">
        Edit
      </Link>

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await setPostStatus(id, !published);
            if (res.error) setError(res.error);
          })
        }
        className="text-[12.5px] font-medium text-[var(--color-ink-2)]"
      >
        {published ? 'Unpublish' : 'Publish'}
      </button>

      {confirming ? (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await deletePost(id);
                if (res.error) setError(res.error);
              })
            }
            className="text-[12.5px] font-bold text-[var(--color-bad)]"
          >
            {pending ? 'Deleting…' : 'Confirm'}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="text-[12.5px] text-[var(--color-ink-3)]">
            Cancel
          </button>
        </>
      ) : (
        // Two-step rather than a native confirm(): deleting a published pick
        // pulls it from every member's feed, so it earns a deliberate second click.
        <button type="button" onClick={() => setConfirming(true)} className="text-[12.5px] font-medium text-[var(--color-ink-3)]">
          Delete
        </button>
      )}
    </span>
  );
}
