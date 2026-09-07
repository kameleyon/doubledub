'use client';

import { useEffect } from 'react';

/**
 * Reveals a scrollbar only while its container is actually being scrolled.
 *
 * CSS can express hover but has no notion of "currently scrolling", so this
 * marks the scrolled element for a moment and lets the stylesheet do the rest.
 *
 * Listens in the capture phase because scroll events do not bubble — a single
 * document-level listener would otherwise never see a nested container.
 */
export function ScrollFade() {
  useEffect(() => {
    const timers = new WeakMap<Element, number>();

    function onScroll(event: Event) {
      const el = event.target instanceof Element ? event.target : document.body;

      el.setAttribute('data-scrolling', '');

      const existing = timers.get(el);
      if (existing) window.clearTimeout(existing);

      timers.set(
        el,
        window.setTimeout(() => el.removeAttribute('data-scrolling'), 700),
      );
    }

    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', onScroll, { capture: true });
  }, []);

  return null;
}
