"use client";

import React from "react";
import Link from "next/link";
import { Building2, ChevronDown, ChevronRight, Landmark, Plus, PlusCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  getActiveRepeGroupKey,
  isRepeNavItemActive,
  type RepeNavGroup,
} from "@/components/repe/workspace/repeNavigation";

type RepeSidebarNavProps = {
  base: string;
  envLabel: string;
  navGroups: RepeNavGroup[];
  pathname: string;
  collapsedGroups: Set<string>;
  onToggleGroup: (key: string) => void;
  onOpenInvestmentDialog: () => void;
};

export function RepeSidebarNav({
  base,
  envLabel,
  navGroups,
  pathname,
  collapsedGroups,
  onToggleGroup,
  onOpenInvestmentDialog,
}: RepeSidebarNavProps) {
  const activeGroupKey = getActiveRepeGroupKey(pathname, navGroups);

  return (
    <div
      className="rounded-2xl border border-bm-border/50 bg-bm-surface/[0.04] p-3.5 shadow-none"
      data-testid="repe-sidebar"
    >
      <nav
        className="flex flex-col"
        data-testid="repe-left-nav"
        aria-label="REPE navigation"
      >
        <div className="rounded-xl border border-bm-border/40 bg-bm-surface/15 px-3.5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">
            Workspace
          </p>
          <div className="mt-2.5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-bm-border/60 bg-bm-surface/35">
              <Building2 size={16} className="text-bm-muted2" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-semibold leading-snug text-bm-text">{envLabel}</p>
              <p className="text-[11px] text-bm-muted2">Real Estate Private Equity</p>
            </div>
            <Landmark size={14} className="shrink-0 text-bm-muted2" aria-hidden="true" />
          </div>
        </div>

        <div className="mt-4 space-y-5">
          {navGroups.map((group) => {
            const isCollapsed = collapsedGroups.has(group.key);
            const groupActive = activeGroupKey === group.key;

            return (
              <div key={group.key} className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => onToggleGroup(group.key)}
                  aria-expanded={!isCollapsed}
                  data-testid={`repe-nav-group-${group.key}`}
                  data-active-context={groupActive ? "true" : "false"}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left transition-colors duration-fast",
                    groupActive
                      ? "bg-bm-surface/22 text-bm-text"
                      : "text-bm-muted2 hover:bg-bm-surface/12 hover:text-bm-text",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-1.5 w-1.5 rounded-full transition-colors",
                      groupActive ? "bg-bm-accent" : "bg-bm-border/70",
                    )}
                  />
                  <span
                    className="flex-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
                    data-testid="repe-nav-group-label"
                  >
                    {group.label}
                  </span>
                  {isCollapsed ? <ChevronRight size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
                </button>

                {!isCollapsed ? (
                  <div className="space-y-1.5">
                    {group.items.map((item) => {
                      const active = isRepeNavItemActive(pathname, item);
                      const Icon = item.icon;

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "group flex items-center gap-3 rounded-[18px] border-l-2 px-3 py-2.5 text-[14px] leading-5 transition-colors duration-fast",
                            active
                              ? "border-l-bm-accent bg-bm-surface/35 font-semibold text-bm-text"
                              : "border-l-transparent text-bm-muted hover:bg-bm-surface/12 hover:text-bm-text",
                          )}
                        >
                          <Icon
                            size={15}
                            strokeWidth={active ? 2 : 1.8}
                            className={cn(
                              "shrink-0 transition-colors duration-fast",
                              active ? "text-bm-accent" : "text-bm-muted2 group-hover:text-bm-muted",
                            )}
                            aria-hidden="true"
                          />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-6 border-t border-bm-border/[0.08] px-1 pt-4">
          <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-bm-muted2">
            Create
          </p>
          <div className="mt-2 space-y-1.5">
            <Link
              href={`${base}/funds/new`}
              className="flex items-center gap-2 rounded-[16px] px-3 py-2 text-[13px] text-bm-muted transition-colors duration-fast hover:bg-bm-surface/12 hover:text-bm-text"
            >
              <PlusCircle size={14} aria-hidden="true" />
              <span>Fund</span>
            </Link>
            <button
              type="button"
              onClick={onOpenInvestmentDialog}
              aria-label="Create investment"
              data-testid="open-investment-intake-dialog"
              className="flex w-full items-center gap-2 rounded-[16px] px-3 py-2 text-left text-[13px] text-bm-muted transition-colors duration-fast hover:bg-bm-surface/12 hover:text-bm-text"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-bm-border/50 bg-bm-surface/35 text-bm-text">
                <Plus size={12} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-bm-text">Investment</span>
                <span className="block text-[11px] text-bm-muted2">Manual intake or source docs</span>
              </span>
            </button>
            <Link
              href={`${base}/assets?create=1`}
              className="flex items-center gap-2 rounded-[16px] px-3 py-2 text-[13px] text-bm-muted transition-colors duration-fast hover:bg-bm-surface/12 hover:text-bm-text"
            >
              <PlusCircle size={14} aria-hidden="true" />
              <span>Asset</span>
            </Link>
          </div>
        </div>
      </nav>
    </div>
  );
}

export function RepeSidebarCompactRail({
  envLabel,
  navGroups,
  pathname,
}: {
  envLabel: string;
  navGroups: RepeNavGroup[];
  pathname: string;
}) {
  const activeGroupKey = getActiveRepeGroupKey(pathname, navGroups);

  return (
    <div
      className="rounded-2xl border border-bm-border/50 bg-bm-surface/[0.04] px-2 py-3 shadow-none"
      data-testid="repe-sidebar-compact"
      aria-label="Compact sidebar navigation"
    >
      <div className="flex justify-center pb-3">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-bm-border/60 bg-bm-surface/25"
          title={envLabel}
        >
          <Building2 size={16} className="text-bm-muted2" aria-hidden="true" />
        </div>
      </div>

      <div className="space-y-4 border-t border-bm-border/[0.08] pt-3">
        {navGroups.map((group) => (
          <div
            key={group.key}
            className={cn(
              "space-y-1 rounded-[18px] px-1 py-2 transition-colors",
              activeGroupKey === group.key ? "bg-bm-surface/18" : "",
            )}
          >
            {group.items.map((item) => {
              const active = isRepeNavItemActive(pathname, item);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={`${group.label}: ${item.label}`}
                  title={`${group.label} · ${item.label}`}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-2xl transition-colors duration-fast",
                    active
                      ? "bg-bm-surface/34 text-bm-accent ring-1 ring-bm-accent/35"
                      : "text-bm-muted2 hover:bg-bm-surface/18 hover:text-bm-text",
                  )}
                >
                  <Icon size={16} strokeWidth={active ? 2.1 : 1.9} aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
