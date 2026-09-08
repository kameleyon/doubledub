'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Slip screenshot input: click, drag, or paste.
 *
 * Paste is the real workflow — you screenshot a bet slip and hit Ctrl+V — so
 * the whole card listens for it rather than hiding the feature behind a file
 * picker.
 *
 * Images are downscaled in the browser before they ever leave it. A phone
 * screenshot is often 2-4 MB of detail nobody needs at feed width; sending
 * ~200 KB instead keeps uploads fast, storage small, and stays well inside the
 * Server Action body limit.
 */

const MAX_EDGE = 1400;
const QUALITY = 0.86;

async function downscale(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  // Already small enough and reasonably sized — leave it alone rather than
  // re-encoding and losing quality for nothing.
  if (scale === 1 && file.size < 600_000) {
    bitmap.close();
    return file;
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', QUALITY),
  );
  if (!blob) return file;

  return new File([blob], 'slip.webp', { type: 'image/webp' });
}

export function SlipDropzone({
  name = 'slip',
  onChangeAction,
  existingUrl,
}: {
  name?: string;
  onChangeAction?: (file: File | null) => void;
  existingUrl?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(existingUrl ?? null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Object URLs are a leak if they are not released when replaced.
  useEffect(() => {
    return () => {
      if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function accept(file: File | null | undefined) {
    if (!file) return;
    setBusy(true);
    const shrunk = await downscale(file);
    setBusy(false);

    // The real <input> is what the form submits, so write the processed file
    // back into it rather than keeping it only in React state.
    const dt = new DataTransfer();
    dt.items.add(shrunk);
    if (inputRef.current) inputRef.current.files = dt.files;

    setPreview((old) => {
      if (old?.startsWith('blob:')) URL.revokeObjectURL(old);
      return URL.createObjectURL(shrunk);
    });
    setInfo(
      `${Math.round(shrunk.size / 1024)} KB` +
        (shrunk.size < file.size ? ` (from ${Math.round(file.size / 1024)} KB)` : ''),
    );
    onChangeAction?.(shrunk);
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = '';
    setPreview((old) => {
      if (old?.startsWith('blob:')) URL.revokeObjectURL(old);
      return null;
    });
    setInfo(null);
    onChangeAction?.(null);
  }

  return (
    <div>
      <div
        onPaste={(e) => accept(Array.from(e.clipboardData.files)[0])}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void accept(e.dataTransfer.files[0]);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        tabIndex={0}
        role="button"
        aria-label="Add slip screenshot"
        className={`flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-[15px] border-[1.5px] border-dashed p-4 text-center outline-none transition-colors ${
          dragging
            ? 'border-[var(--color-accent)] bg-[rgba(248,209,23,0.06)]'
            : 'border-[#34343A] bg-[#17171A] focus:border-[var(--color-accent)]'
        }`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Slip preview" className="max-h-[300px] w-auto rounded-[10px]" />
        ) : (
          <>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8C8C93" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16.5V4.5" />
              <path d="m7.5 9 4.5-4.5L16.5 9" />
              <path d="M4.5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15" />
            </svg>
            <span className="text-[14px] font-medium text-[#C9C9CE]">
              {busy ? 'Processing…' : 'Click, drop a file, or paste with Ctrl + V'}
            </span>
            <span className="text-[11.5px] text-[var(--color-ink-4)]">
              PNG, JPEG or WebP &middot; resized automatically
            </span>
          </>
        )}
      </div>

      {preview ? (
        <div className="mt-2 flex items-center gap-3">
          <span className="text-[11.5px] text-[var(--color-ink-3)]">{info ?? 'Current image'}</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-[12.5px] font-medium text-[var(--color-ink-2)]"
          >
            Replace
          </button>
          <button type="button" onClick={clear} className="text-[12.5px] font-medium text-[var(--color-bad)]">
            Remove
          </button>
        </div>
      ) : null}

      <input
        ref={inputRef}
        name={name}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => accept(e.target.files?.[0])}
      />
    </div>
  );
}
