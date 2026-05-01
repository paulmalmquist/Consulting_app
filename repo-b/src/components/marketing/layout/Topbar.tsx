'use client';

import { Menu } from 'lucide-react';
import { InlineSearch } from '../search/InlineSearch';
import { AccountButton } from './AccountButton';

type TopbarProps = {
  isCollapsed: boolean;
  toggleCollapsed: () => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
};

export function Topbar({ setDrawerOpen }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b bg-nv-bg/90 px-4 py-3 backdrop-blur md:px-8" style={{ borderColor: 'rgb(var(--nv-hair-soft) / 0.06)' }}>
      <div className="mx-auto flex w-full max-w-none flex-col gap-3">
        {/* Row 1: search + account */}
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
          </div>
          <AccountButton />
        </div>
        {/* Mobile-only search row */}
        <div className="md:hidden">
          <InlineSearch />
        </div>
      </div>
    </header>
  );
}
