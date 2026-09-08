import Link from 'next/link';

// Search lives on the feed itself. "My Tails" is out while tailing is hidden —
// a tab leading to a list of something you cannot create reads as broken.
const ITEMS = [
  { href: '/feed', label: 'Feed', icon: 'feed' },
  { href: '/membership', label: 'Plan', icon: 'plan' },
  { href: '/profile', label: 'Profile', icon: 'profile' },
] as const;

export function BottomNav({ active }: { active: string }) {
  return (
    <nav className="flex h-[76px] flex-shrink-0 items-start justify-around border-t border-[#232327] bg-[#151517] px-2 pt-[10px]">
      {ITEMS.map((item) => {
        const on = item.href === active;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex h-[52px] w-[68px] flex-col items-center justify-center gap-[5px] no-underline ${
              on ? 'text-[var(--color-accent)]' : 'text-[#5E5E66]'
            }`}
          >
            <Icon name={item.icon} />
            <span className={`text-[10px] ${on ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Icon({ name }: { name: string }) {
  const common = { width: 21, height: 21, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9 } as const;
  if (name === 'feed')
    return (
      <svg {...common} strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="7.5" rx="2.4" />
        <rect x="3" y="14" width="18" height="6" rx="2.2" />
      </svg>
    );
  if (name === 'plan')
    return (
      <svg {...common} strokeLinejoin="round" strokeLinecap="round">
        <rect x="3" y="5" width="18" height="14" rx="2.4" />
        <path d="M3 9.5h18" />
        <path d="M7 14.5h4" />
      </svg>
    );
  if (name === 'tails')
    return (
      <svg {...common} strokeLinejoin="round">
        <path d="M6 4.9A1.9 1.9 0 0 1 7.9 3h8.2A1.9 1.9 0 0 1 18 4.9V21l-6-3.8L6 21V4.9Z" />
      </svg>
    );
  return (
    <svg {...common} strokeLinecap="round">
      <circle cx="12" cy="8.4" r="3.7" /><path d="M4.9 20a7.6 7.6 0 0 1 14.2 0" />
    </svg>
  );
}
