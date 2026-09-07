'use client';

import { useTransition, useState } from 'react';
import { deletePost } from '@/lib/actions/admin';

export function DeletePostButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-[12.5px] font-medium text-[var(--color-ink-3)]"
      >
        Delete
      </button>
    );
  }

  // Two-step rather than a native confirm(): deleting a published pick removes
  // it from every member's feed, so it should take a deliberate second click.
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => { await deletePost(id); })}
        className="text-[12.5px] font-bold text-[var(--color-bad)]"
      >
        {pending ? 'Deleting…' : 'Confirm'}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-[12.5px] text-[var(--color-ink-3)]">
        Cancel
      </button>
    </span>
  );
}
