"use client";

import Link from "next/link";
import { Menu, ArrowLeft, Cpu } from "lucide-react";
import { ThemeToggle } from "@/components/theme/ThemeProvider";

export default function SupplyChainTopBar({
  envId,
  onOpenSidebar,
}: {
  envId: string;
  onOpenSidebar: () => void;
}) {
  return (
    <header
      className="sticky top-0 z-30 border-b border-bm-border/70 bg-bm-bg/85 backdrop-blur"
      data-testid="supply-chain-topbar"
    >
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-3 px-4 py-3 lg:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenSidebar}
            className="lg:hidden rounded-md border border-bm-border/70 p-2 text-bm-muted hover:bg-bm-surface/40 hover:text-bm-text"
            aria-label="Open navigation"
          >
            <Menu size={16} />
          </button>
          <Link
            href={`/lab/env/${envId}`}
            className="hidden lg:inline-flex items-center gap-2 rounded-md border border-bm-border/70 px-2.5 py-1.5 text-xs text-bm-muted hover:text-bm-text hover:bg-bm-surface/40"
          >
            <ArrowLeft size={14} />
            Back to environment
          </Link>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-bm-accent/35 bg-bm-accent/10 text-bm-accent">
              <Cpu size={15} />
            </span>
            <div className="leading-tight">
              <p className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">Supply Chain Data Platform</p>
              <p className="text-sm font-medium text-bm-text">Databricks Lakehouse · medallion build</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden md:inline-flex items-center rounded-full border border-bm-border/70 bg-bm-surface/40 px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
            Demo · Seeded
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
