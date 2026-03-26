"use client";

import {
  LayoutDashboard,
  Droplets,
  Building2,
  DollarSign,
  Landmark,
  TrendingUp,
  Network,
  GitCompare,
  ClipboardList,
  FileSpreadsheet,
} from "lucide-react";
import type { FundScenarioTab } from "./types";

const TABS: { key: FundScenarioTab; label: string; icon: typeof LayoutDashboard; enabled: boolean }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard, enabled: true },
  { key: "waterfall", label: "Waterfall", icon: Droplets, enabled: true },
  { key: "asset-drivers", label: "Asset Drivers", icon: Building2, enabled: true },
  { key: "cash-flows", label: "Cash Flows", icon: DollarSign, enabled: true },
  { key: "debt-refi", label: "Debt / Refi", icon: Landmark, enabled: true },
  { key: "valuation", label: "Valuation", icon: TrendingUp, enabled: true },
  { key: "jv-ownership", label: "JV / Ownership", icon: Network, enabled: true },
  { key: "compare", label: "Compare", icon: GitCompare, enabled: true },
  { key: "audit", label: "Audit", icon: ClipboardList, enabled: true },
  { key: "excel-sync", label: "Excel Sync", icon: FileSpreadsheet, enabled: true },
];

export function FundScenarioTabBar({
  activeTab,
  onChange,
}: {
  activeTab: FundScenarioTab;
  onChange: (tab: FundScenarioTab) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-bm-border/70 bg-bm-surface/20 p-1">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => tab.enabled && onChange(tab.key)}
            disabled={!tab.enabled}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition ${
              isActive
                ? "bg-bm-surface/50 text-bm-text font-medium"
                : tab.enabled
                  ? "text-bm-muted hover:bg-bm-surface/30 hover:text-bm-text"
                  : "text-bm-muted/40 cursor-not-allowed"
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

export { TABS };
