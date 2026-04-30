'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ArrowRightLeft,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Compass,
  Factory,
  House,
  Layers3,
  Mail,
  UserRound,
  Workflow,
  X
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import navigation from '@content/navigation.json';
import { cn } from '../ui/cn';

const ALLOWED_NAV_ITEMS = new Set([
  'Home',
  'What We Do',
  'Industries',
  'The Shift',
  'Operational Assessment',
  'AI Concierge',
  'Comprehensive Data Strategy',
  'Legacy SaaS Migration',
  'About',
  'Contact'
]);

const INDUSTRY_CHILDREN = [
  { label: 'Real Estate Private Equity', href: '/industries/real-estate-private-equity' },
  { label: 'Consumer Credit', href: '/industries/consumer-credit' },
  { label: 'Medical', href: '/industries/medical' },
  { label: 'Legal', href: '/industries/legal' }
];

const VISIBLE_NAV_GROUPS = navigation.groups
  .map((group) => ({
    ...group,
    items: group.items.filter((item) => ALLOWED_NAV_ITEMS.has(item.label))
  }))
  .filter((group) => group.items.length > 0);

const NAV_ICON_BY_LABEL: Record<string, LucideIcon> = {
  Home: House,
  'AI Concierge': Compass,
  'What We Do': Workflow,
  'The Shift': ArrowRightLeft,
  'Comprehensive Data Strategy': BarChart3,
  'Legacy SaaS Migration': Layers3,
  Industries: Factory,
  'Operational Assessment': ClipboardCheck,
  About: UserRound,
  Contact: Mail
};

type LayoutState = {
  isCollapsed: boolean;
  toggleCollapsed: () => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
};

export function SidebarNav({ isCollapsed, toggleCollapsed, drawerOpen, setDrawerOpen }: LayoutState) {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    VISIBLE_NAV_GROUPS.forEach((group) => {
      initial[group.title] = true;
    });
    return initial;
  });
  const [industriesOpen, setIndustriesOpen] = useState(pathname.startsWith('/industries'));

  useEffect(() => {
    if (pathname.startsWith('/industries')) {
      setIndustriesOpen(true);
    }
  }, [pathname]);

  const toggleGroup = (title: string) => {
    setOpenGroups((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const isActivePath = (href: string) => {
    if (href === '/') return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const renderNavItem = (item: { label: string; href: string }) => {
    const Icon = NAV_ICON_BY_LABEL[item.label];
    const active = isActivePath(item.href);
    if (!Icon) return null;

    if (item.label === 'Industries') {
      const industriesActive = pathname.startsWith('/industries');
      return (
        <div key={item.href} className="space-y-1">
          <div
            className={cn(
              'group relative flex items-center gap-2 rounded-[4px] px-2 py-1.5 text-sm transition-all duration-120',
              industriesActive
                ? 'bg-gradient-to-r from-nv-teal/8 to-transparent text-nv-text'
                : 'text-nv-muted hover:bg-nv-text/[0.02] hover:text-nv-text'
            )}
          >
            {industriesActive && (
              <span className="absolute left-0 top-[20%] bottom-[20%] w-0.5 rounded-[2px] bg-nv-teal" />
            )}
            <Link
              href={item.href}
              onClick={() => setDrawerOpen(false)}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <span
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded-[4px]',
                  industriesActive
                    ? 'text-nv-teal'
                    : 'text-nv-dim group-hover:text-nv-muted'
                )}
                role="img"
                aria-label={`${item.label} icon`}
              >
                <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
              </span>
              <span className={cn('truncate', isCollapsed && 'sr-only')}>{item.label}</span>
            </Link>
            <button
              type="button"
              onClick={() => setIndustriesOpen((prev) => !prev)}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-[4px] text-nv-dim transition hover:bg-nv-text/[0.03] hover:text-nv-muted',
                isCollapsed && 'hidden'
              )}
              aria-label={industriesOpen ? 'Collapse industries list' : 'Expand industries list'}
              aria-expanded={industriesOpen}
            >
              <ChevronDown size={14} className={cn('transition-transform duration-300', industriesOpen ? 'rotate-0' : '-rotate-90')} />
            </button>
          </div>

          <div
            className={cn(
              'overflow-hidden pl-12 pr-1 transition-[max-height,opacity] duration-300 ease-out',
              industriesOpen ? 'max-h-[360px] opacity-100' : 'max-h-0 opacity-0'
            )}
          >
            <div className="space-y-1 pb-1 pt-1">
              {INDUSTRY_CHILDREN.map((child) => {
                const childActive = isActivePath(child.href);
                return (
                  <Link
                    key={child.href}
                    href={child.href}
                    onClick={() => setDrawerOpen(false)}
                    className={cn(
                      'relative block rounded-[4px] px-3 py-2 text-xs transition-all duration-120',
                      childActive
                        ? 'bg-gradient-to-r from-nv-teal/8 to-transparent text-nv-text'
                        : 'text-nv-muted hover:bg-nv-text/[0.02] hover:text-nv-text'
                    )}
                  >
                    {childActive && (
                      <span className="absolute left-0 top-[20%] bottom-[20%] w-0.5 rounded-[2px] bg-nv-teal" />
                    )}
                    {child.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setDrawerOpen(false)}
        className={cn(
          'group relative flex items-center gap-3 rounded-[4px] px-3 py-2 text-sm transition-all duration-120',
          active
            ? 'bg-gradient-to-r from-nv-teal/8 to-transparent text-nv-text'
            : 'text-nv-muted hover:bg-nv-text/[0.02] hover:text-nv-text'
        )}
      >
        {active && (
          <span className="absolute left-0 top-[20%] bottom-[20%] w-0.5 rounded-[2px] bg-nv-teal" />
        )}
        <span
          className={cn(
            'inline-flex h-8 w-8 items-center justify-center rounded-[4px]',
            active ? 'text-nv-teal' : 'text-nv-dim group-hover:text-nv-muted'
          )}
          role="img"
          aria-label={`${item.label} icon`}
        >
          <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
        </span>
        <span className={cn(isCollapsed && 'sr-only')}>{item.label}</span>
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r [border-color:rgb(var(--nv-hair-soft)/0.06)] bg-nv-surface/95 backdrop-blur md:static md:translate-x-0',
        drawerOpen ? 'translate-x-0' : '-translate-x-full',
        isCollapsed ? 'md:w-20' : 'md:w-72'
      )}
    >
      <div className="flex items-center justify-between px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="relative h-11 w-11 overflow-hidden rounded-[8px] border [border-color:var(--nv-hair-medium-rgba)] bg-nv-bg/80">
            <Image
              src="/assets/branding/Image-1.jpg"
              alt="Novendor logo"
              fill
              sizes="44px"
              className="object-cover"
              priority
            />
          </div>
          {!isCollapsed && (
            <p className="nv-headline text-base font-semibold uppercase tracking-[0.14em] text-nv-text">Novendor</p>
          )}
        </div>
        <button
          type="button"
          className="hidden p-0.5 text-nv-dim transition hover:text-nv-muted md:inline-flex"
          onClick={toggleCollapsed}
          aria-label="Toggle sidebar"
        >
          {isCollapsed ? <ChevronRight size={16} strokeWidth={1.8} /> : <ChevronLeft size={16} strokeWidth={1.8} />}
        </button>
        <button
          type="button"
          className="inline-flex rounded-[4px] border [border-color:var(--nv-hair-medium-rgba)] p-2 text-nv-muted md:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-6">
        {VISIBLE_NAV_GROUPS.map((group) => (
          <div key={group.title} className="space-y-2">
            <button
              type="button"
              onClick={() => toggleGroup(group.title)}
              className="flex w-full items-center justify-between rounded-[4px] px-2 py-2 text-xs font-semibold uppercase tracking-wide text-nv-faint hover:text-nv-muted"
              aria-expanded={openGroups[group.title]}
            >
              <span className={cn(isCollapsed && 'sr-only')}>{group.title}</span>
              <ChevronDown
                size={14}
                className={cn('transition', openGroups[group.title] ? 'rotate-0' : '-rotate-90', isCollapsed && 'hidden')}
              />
            </button>
            {openGroups[group.title] && <div className="space-y-1">{group.items.map((item) => renderNavItem(item))}</div>}
          </div>
        ))}
      </nav>

      <div className="px-4 pb-5">
        <div className="rounded-[8px] shadow-nv-surface bg-nv-raised/80 p-4 text-xs text-nv-muted">
          <p className={cn(isCollapsed && 'sr-only')}>Ready to talk?</p>
          <Link
            href="/contact"
            onClick={() => setDrawerOpen(false)}
            className="mt-2 inline-flex w-full items-center justify-center rounded-[4px] bg-gradient-to-b from-[#5EC2B7] to-nv-teal px-3 py-2 text-xs font-semibold text-[#0B1E1C] shadow-nv-btn-primary transition hover:-translate-y-px"
          >
            Start with one workflow
          </Link>
        </div>
      </div>
    </aside>
  );
}
