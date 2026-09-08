'use client';

import { useState, useTransition } from 'react';
import { toggleLike } from '@/lib/actions/engagement';
import { relativeTime, formatViews, BET_TYPE_LABEL, type FeedPost } from '@/lib/feed';

export function PostCard({ post }: { post: FeedPost }) {
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likeCount);
  const [, start] = useTransition();

  // Optimistic, with rollback: the count moves on tap and reverts if the
  // server refuses, so a failure is visible rather than silently swallowed.
  function onLike() {
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    start(async () => {
      const res = await toggleLike(post.id, next);
      if (!res.ok) {
        setLiked(!next);
        setLikes((n) => n + (next ? -1 : 1));
      }
    });
  }

  return (
    <article className="flex-shrink-0 rounded-[16px] border border-[var(--color-line)] bg-[var(--color-surface)]">
      <header className="flex items-center gap-2 px-[14px] pt-[14px]">
        <span className="rounded-[6px] bg-[var(--color-surface-3)] px-2 py-[3px] text-[10px] font-semibold tracking-[0.07em] text-[var(--color-ink-2)]">
          {BET_TYPE_LABEL[post.betType] ?? 'Pick'}
        </span>
        <span
          className={`rounded-[6px] px-2 py-[3px] text-[10px] font-semibold tracking-[0.07em] ${
            post.kind === 'slip'
              ? 'bg-[rgba(248,209,23,0.13)] text-[var(--color-accent)]'
              : 'bg-[var(--color-surface-3)] text-[var(--color-ink-2)]'
          }`}
        >
          {post.kind === 'slip' ? 'Slip' : 'Pick'}
        </span>
        {post.pinned ? (
          <span className="rounded-[6px] bg-[var(--color-surface-3)] px-2 py-[3px] text-[10px] font-semibold tracking-[0.07em] text-[var(--color-ink-3)]">
            Pinned
          </span>
        ) : null}
        <span className="flex-1" />
        <span className="text-[11.5px] text-[var(--color-ink-3)]">{relativeTime(post.publishedAt)}</span>
      </header>

      {post.caption ? (
        <p className="px-[14px] pt-[11px] text-[13.5px] leading-relaxed text-[#B6B6BC] text-pretty">
          {post.caption}
        </p>
      ) : null}

      {post.kind === 'slip' && post.media.length > 0 ? (
        <div data-no-copy className="mx-[14px] mt-[13px] overflow-hidden rounded-[12px] border border-[#3A3A41]">
          {post.media.map((m) => (
            // Signed URL, valid ~90s. Deliberately not next/image: optimizing it
            // would cache a paywalled image on the CDN under a stable URL.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={m.id}
              src={m.url}
              alt="Betting slip"
              width={m.width ?? undefined}
              height={m.height ?? undefined}
              className="block h-auto w-full select-none"
              draggable={false}
            />
          ))}
        </div>
      ) : null}

      {post.kind === 'text' && post.legs.length > 0 ? (
        <div className="mx-[14px] mt-[13px] rounded-[12px] border border-[#2E2E35] bg-[var(--color-surface-2)] p-[14px]">
          {post.title ? (
            <div className="text-[9.5px] font-bold uppercase tracking-[0.15em] text-[var(--color-accent)]">
              {post.title}
            </div>
          ) : null}
          <div className="mt-[11px] flex flex-col gap-[11px]">
            {post.legs.map((leg, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <div className="flex flex-col gap-[3px]">
                  <span className="text-[13.5px] font-medium tracking-[-0.01em] text-[var(--color-ink)]">
                    {leg.selection}
                  </span>
                  <span className="text-[11px] text-[var(--color-ink-3)]">
                    {[leg.units ? `${leg.units} unit${leg.units === 1 ? '' : 's'}` : null, leg.market]
                      .filter(Boolean)
                      .join('  ·  ')}
                  </span>
                </div>
                <span className="font-mono text-[13.5px] font-medium text-[var(--color-accent)]">
                  {leg.odds}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <footer className="mt-[13px] flex items-center gap-[7px] border-t border-[#232327] px-[14px] py-[13px]">
        <button
          type="button"
          onClick={onLike}
          aria-pressed={liked}
          className={`flex h-11 items-center gap-[6px] rounded-[11px] px-[11px] text-[12.5px] font-medium ${
            liked ? 'text-[#E8607A]' : 'text-[#8C8C93]'
          }`}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
            <path d="M20.7 8.7c0 4.7-8.7 9.6-8.7 9.6S3.3 13.4 3.3 8.7A4.6 4.6 0 0 1 12 6.8a4.6 4.6 0 0 1 8.7 1.9Z" />
          </svg>
          {likes}
        </button>

        <span className="flex h-11 items-center gap-[5px] px-[9px] text-[12px] font-medium text-[#5B5B62]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M5 19v-4.5" /><path d="M11 19V9" /><path d="M17 19V4.5" />
          </svg>
          {formatViews(post.viewCount)}
        </span>

      </footer>
    </article>
  );
}
