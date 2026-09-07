import { createAdminClient } from '@/lib/supabase/server';

export default async function AdminMembersPage() {
  const db = createAdminClient();

  const { data: subs } = await db
    .from('subscriptions')
    .select('user_id, status, plan_code, term_days, current_period_end, cancel_at_period_end, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = subs ?? [];

  // Emails live in auth.users, which has no foreign-key join from here — so
  // resolve them in one call rather than N.
  const emails = new Map<string, string>();
  if (rows.length) {
    const { data: users } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    for (const u of users?.users ?? []) emails.set(u.id, u.email ?? '');
  }

  const active = rows.filter((r) => r.status === 'active' || r.status === 'trialing').length;

  return (
    <main className="flex-1 px-6 py-7 md:px-8">
      <h1 className="text-[22px] font-bold tracking-[-0.03em]">Members</h1>
      <p className="mt-1 text-[12.5px] text-[var(--color-ink-3)]">
        {rows.length} subscription record{rows.length === 1 ? '' : 's'} &middot; {active} currently
        active
      </p>

      {rows.length === 0 ? (
        <p className="mt-10 text-[13px] text-[var(--color-ink-3)]">
          No subscriptions yet. They appear here as soon as the Stripe webhook records one.
        </p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-[16px] border border-[#232327] bg-[#17171A]">
          {rows.map((r) => (
            <div
              key={r.user_id}
              className="flex flex-wrap items-center gap-4 border-b border-[#202024] px-5 py-4 last:border-b-0"
            >
              <span className="min-w-[200px] flex-1 truncate text-[13.5px] font-medium">
                {emails.get(r.user_id) ?? r.user_id}
              </span>
              <span className="w-[86px] text-[12.5px] text-[var(--color-ink-2)]">
                {r.plan_code ?? '—'}
              </span>
              <span
                className={`rounded-[6px] px-2 py-1 text-[9.5px] font-bold uppercase tracking-[0.06em] ${
                  r.status === 'active' || r.status === 'trialing'
                    ? 'bg-[rgba(63,191,127,0.12)] text-[var(--color-good)]'
                    : r.status === 'past_due'
                      ? 'bg-[rgba(224,162,60,0.13)] text-[var(--color-warn)]'
                      : 'bg-[#26262B] text-[var(--color-ink-2)]'
                }`}
              >
                {r.status}
              </span>
              <span className="w-[118px] text-right text-[12px] text-[var(--color-ink-3)]">
                {r.current_period_end
                  ? `${r.cancel_at_period_end ? 'ends' : 'renews'} ${new Date(
                      r.current_period_end,
                    ).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                  : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
