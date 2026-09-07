'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { LEAGUE_FILTERS, prettyLeague } from '@/lib/feed';

/**
 * Filters live in the URL rather than component state so the choice survives a
 * refresh, a back button, and a shared-with-yourself link.
 */
export function LeagueFilter() {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get('league') ?? 'All';

  function pick(league: string) {
    const next = new URLSearchParams(params.toString());
    if (league === 'All') next.delete('league');
    else next.set('league', league);
    router.push(`/feed${next.toString() ? `?${next}` : ''}`, { scroll: false });
  }

  return (
    <div className="dd-scroll flex flex-shrink-0 gap-2 overflow-x-auto px-[18px] pb-4">
      {LEAGUE_FILTERS.map((league) => {
        const on = league === current;
        return (
          <button
            key={league}
            type="button"
            onClick={() => pick(league)}
            className={`h-11 flex-shrink-0 whitespace-nowrap rounded-full border px-4 text-[13px] font-medium ${
              on
                ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                : 'border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-2)]'
            }`}
          >
            {prettyLeague(league)}
          </button>
        );
      })}
    </div>
  );
}
