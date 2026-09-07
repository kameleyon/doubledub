'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { uploadSlip } from '@/lib/actions/admin';

export function SlipUploader({ postId }: { postId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function send(file: File) {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set('postId', postId);
    fd.set('file', file);
    const res = await uploadSlip(fd);
    setBusy(false);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  return (
    <div>
      {/* Paste is the real workflow: you screenshot a slip and hit Ctrl+V.
          Requiring a trip through the file picker would be the slow path. */}
      <div
        onPaste={(e) => {
          const file = Array.from(e.clipboardData.files)[0];
          if (file) void send(file);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) void send(file);
        }}
        onClick={() => inputRef.current?.click()}
        tabIndex={0}
        role="button"
        className="flex h-[190px] cursor-pointer flex-col items-center justify-center gap-3 rounded-[15px] border-[1.5px] border-dashed border-[#34343A] bg-[#17171A] text-center outline-none focus:border-[var(--color-accent)]"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8C8C93" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 16.5V4.5" />
          <path d="m7.5 9 4.5-4.5L16.5 9" />
          <path d="M4.5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15" />
        </svg>
        <span className="text-[14px] font-medium text-[#C9C9CE]">
          {busy ? 'Uploading…' : 'Click, drop a file, or paste with Ctrl + V'}
        </span>
        <span className="text-[11.5px] text-[var(--color-ink-4)]">
          PNG, JPEG or WebP &middot; up to 10 MB
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void send(file);
        }}
      />

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-[11px] border border-[#4A2725] bg-[#2A1917] px-4 py-3 text-[12.5px] text-[var(--color-bad)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
