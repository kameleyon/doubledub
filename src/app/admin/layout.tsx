import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, isAdmin } from '@/lib/auth';

export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Guards every /admin route.
 *
 * Returns notFound() rather than a 403 for non-admins: a "forbidden" response
 * confirms the admin area exists and is worth attacking. As far as a member is
 * concerned, these URLs simply are not routes.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !(await isAdmin(user.id))) notFound();

  return (
    <div className="flex min-h-dvh bg-[#0E0E10]">
      <aside className="hidden w-[232px] flex-shrink-0 flex-col border-r border-[#202024] bg-[#0E0E10] p-4 md:flex">
        <div className="flex items-center gap-[10px] px-2 pb-6">
          <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-[var(--color-accent)]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#121214" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.5 12.6 9.6 17.7 19.5 6.9" />
            </svg>
          </span>
          <span className="flex-1 text-[16px] font-bold tracking-[-0.05em] text-[var(--color-accent)]">
            doubledub
          </span>
          <span className="rounded-[5px] bg-[var(--color-surface)] px-[6px] py-[3px] text-[8.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-4)]">
            Admin
          </span>
        </div>

        <nav className="flex flex-col gap-[3px]">
          <NavLink href="/admin">Posts</NavLink>
          <NavLink href="/admin/new">New post</NavLink>
          <NavLink href="/admin/members">Members</NavLink>
        </nav>

        <div className="flex-1" />

        <Link
          href="/feed"
          className="rounded-[10px] px-3 py-[10px] text-[13px] font-medium text-[var(--color-ink-3)] no-underline"
        >
          ← Back to feed
        </Link>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-[#202024] px-5 py-3 md:hidden">
          <Link href="/admin" className="text-[15px] font-bold tracking-[-0.03em] text-[var(--color-accent)] no-underline">
            doubledub admin
          </Link>
          <span className="flex-1" />
          <Link href="/admin/new" className="text-[13px] font-medium text-[var(--color-ink-2)] no-underline">
            New
          </Link>
          <Link href="/feed" className="text-[13px] font-medium text-[var(--color-ink-2)] no-underline">
            Feed
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex h-11 items-center rounded-[10px] px-3 text-[13.5px] font-medium text-[var(--color-ink-2)] no-underline hover:bg-[#1E1E22] hover:text-[var(--color-ink)]"
    >
      {children}
    </Link>
  );
}
