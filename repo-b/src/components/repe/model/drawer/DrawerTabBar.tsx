"use client";

import { Sliders, Table2, TrendingUp, PieChart } from "lucide-react";

export const DRAWER_TABS = [
  { key: "assumptions", label: "Assumptions", icon: Sliders },
  { key: "cashflow", label: "Cash Flow", icon: Table2 },
  { key: "valuation", label: "Valuation", icon: TrendingUp },
  { key: "returns", label: "Returns", icon: PieChart },
] as const;

export type DrawerTabKey = (typeof DRAWER_TABS)[number]["key"];

export function DrawerTabBar({
  activeTab,
  onChange,
}: {
  activeTab: DrawerTabKey;
  onChange: (tab: DrawerTabKey) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-bm-border/50 bg-bm-surface/15 p-0.5 mb-4">
      {DRAWER_TABS.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] transition ${
              activeTab === tab.key
                ? "bg-bm-surface/50 text-bm-text font-medium"
                : "text-bm-muted hover:bg-bm-surface/25 hover:text-bm-text"
            }`}
          >
            <Icon size={12} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
