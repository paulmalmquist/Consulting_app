"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Network,
  Database,
  Layers,
  Boxes,
  ShieldCheck,
  Sparkles,
  LineChart,
  MessageSquareText,
  Map,
} from "lucide-react";
import { cn } from "@/lib/cn";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

function buildNav(base: string): NavItem[] {
  return [
    { href: base, label: "Command Center", icon: LayoutDashboard },
    { href: `${base}/architecture`, label: "Architecture", icon: Network },
    { href: `${base}/source-systems`, label: "Source Systems", icon: Database },
    { href: `${base}/medallion`, label: "Medallion Pipelines", icon: Layers },
    { href: `${base}/data-products`, label: "Data Products", icon: Boxes },
    { href: `${base}/governance`, label: "Governance", icon: ShieldCheck },
    { href: `${base}/ai-sdlc`, label: "AI SDLC", icon: Sparkles },
    { href: `${base}/forecasting`, label: "Forecasting / ML", icon: LineChart },
    { href: `${base}/genie`, label: "Genie / NL BI", icon: MessageSquareText },
    { href: `${base}/roadmap`, label: "Delivery Roadmap", icon: Map },
  ];
}

function isActive(pathname: string, href: string, base: string): boolean {
  if (href === base) return pathname === base || pathname === `${base}/`;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SupplyChainSidebar({
  envId,
  onNavigate,
}: {
  envId: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const base = `/lab/env/${envId}/supply-chain`;
  const items = buildNav(base);

  return (
    <nav aria-label="Supply Chain navigation" className="space-y-1.5" data-testid="supply-chain-sidebar">
      <div className="px-3 pb-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">
          Lakehouse Build
        </p>
      </div>
      {items.map((item) => {
        const active = isActive(pathname, item.href, base);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            data-testid={`sc-nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
            className={cn(
              "flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition-[transform,box-shadow] duration-[120ms]",
              active
                ? "border-bm-accent/40 bg-bm-accent/10 text-bm-text font-medium"
                : "border-transparent text-bm-muted hover:border-bm-border/70 hover:bg-bm-surface/45 hover:text-bm-text"
            )}
          >
            <Icon size={16} className={active ? "text-bm-accent" : "text-bm-muted2"} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
