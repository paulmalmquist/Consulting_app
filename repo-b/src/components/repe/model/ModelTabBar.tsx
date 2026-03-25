"use client";

import {
  Building2,
  Sliders,
  BarChart3,
  GitCompare,
} from "lucide-react";

export const TABS = [
  { key: "builder", label: "Scenario Builder", icon: Building2 },
  { key: "assumptions", label: "Assumptions", icon: Sliders },
  { key: "results", label: "Results", icon: BarChart3 },
  { key: "compare", label: "Compare", icon: GitCompare },
] as const;

export type TabKey = (typeof TABS)[number]["key"];

export function ModelTabBar({
  activeTab,
  onChange,
}: {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-bm-border/70 bg-bm-surface/20 p-1">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition ${
              activeTab === tab.key
                ? "bg-bm-surface/50 text-bm-text font-medium"
                : "text-bm-muted hover:bg-bm-surface/30 hover:text-bm-text"
            }`}
            data-testid={`tab-${tab.key}`}
          >
            <Icon size={14} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
