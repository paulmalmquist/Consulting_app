'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
import { InlineSearch } from '../search/InlineSearch';
import { AccountButton } from './AccountButton';

type TopbarProps = {
  isCollapsed: boolean;
  toggleCollapsed: () => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
};

const topNavLinks = [
  { label: 'Home', href: '/' },
  { label: 'What We Do', href: '/what-we-do' },
  { label: 'Industries', href: '/industries' },
  { label: 'Capabilities', href: '/capabilities' },
  { label: 'The Shift', href: '/the-shift' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' }
];

export function Topbar({ setDrawerOpen }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-ink/90 px-4 py-3 backdrop-blur md:px-8">
      <div className="mx-auto flex w-full max-w-none flex-col gap-3">
        {/* Row 1: search + CTA + account (desktop) / hamburger + account (mobile) */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md border border-slate-700/60 p-2 text-slate-200 md:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <div className="hidden flex-1 items-center gap-3 md:flex">
            <InlineSearch />
            <Link
              href="/operational-assessment"
              className="shrink-0 rounded-full border border-emerald-300/40 bg-emerald-300/10 px-4 py-1.5 text-xs font-semibold text-emerald-100 hover:border-emerald-200/60 hover:bg-emerald-300/15"
            >
              See your first use case
            </Link>
          </div>
          <AccountButton />
        </div>
        {/* Row 2: nav links (desktop only) */}
        <nav className="hidden flex-wrap items-center gap-2 md:flex">
          {topNavLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full border border-slate-700/80 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-emerald-300/40 hover:text-emerald-100"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        {/* Row 1 mobile: search below hamburger row */}
        <div className="md:hidden">
          <InlineSearch />
        </div>
      </div>
    </header>
  );
}
