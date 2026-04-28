'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Menu, Moon, Sun } from 'lucide-react';
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
  { label: 'Contact', href: '/contact' },
];

function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const saved = (typeof window !== 'undefined'
      ? (localStorage.getItem('nv-theme') as 'dark' | 'light' | null)
      : null);
    const initial = saved === 'light' ? 'light' : 'dark';
    setTheme(initial);
    document.querySelector('.marketing-shell')?.setAttribute('data-theme', initial);
  }, []);

  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.querySelector('.marketing-shell')?.setAttribute('data-theme', next);
    try {
      localStorage.setItem('nv-theme', next);
    } catch {
      // ignore
    }
  };

  const Icon = theme === 'light' ? Moon : Sun;
  const label = theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="nv-btn nv-btn-ghost shrink-0"
      style={{ padding: '8px', borderRadius: 'var(--nv-radius-sm)' }}
    >
      <Icon size={16} strokeWidth={1.8} />
    </button>
  );
}

export function Topbar({ setDrawerOpen }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b bg-nv-bg/90 px-4 py-3 backdrop-blur md:px-8" style={{ borderColor: 'rgb(var(--nv-hair-soft) / 0.06)' }}>
      <div className="mx-auto flex w-full max-w-none flex-col gap-3">
        {/* Row 1: search + CTA + account */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-[4px] p-2 text-nv-muted md:hidden"
            style={{ boxShadow: 'inset 0 0 0 1px var(--nv-hair-medium-rgba)' }}
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <div className="hidden flex-1 items-center gap-3 md:flex">
            <InlineSearch />
            <Link
              href="/operational-assessment"
              className="nv-btn nv-btn-primary shrink-0"
              style={{ fontSize: 12, padding: '7px 14px' }}
            >
              See your first use case
            </Link>
          </div>
          <ThemeToggle />
          <AccountButton />
        </div>
        {/* Row 2: nav links (desktop only) */}
        <nav className="hidden flex-wrap items-center gap-2 md:flex">
          {topNavLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-[4px] px-3 py-1.5 text-xs font-medium text-nv-muted transition hover:text-nv-text"
              style={{ boxShadow: 'inset 0 0 0 1px var(--nv-hair-medium-rgba)' }}
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
