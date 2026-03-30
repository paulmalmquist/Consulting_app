"use client";

import React from "react";
import type { AssetScope, DecisionTab } from "@/lib/trading-lab/decision-engine-types";

interface DecisionEngineSidebarProps {
  activeTab: DecisionTab;
  assetScope: AssetScope;
  onTabChange: (tab: DecisionTab) => void;
  onScopeChange: (scope: AssetScope) => void;
}

const SCOPE_ITEMS: { scope: AssetScope; label: string; icon: string }[] = [
  { scope: "global", label: "Global View", icon: "G" },
  { scope: "equities", label: "Equities", icon: "E" },
  { scope: "crypto", label: "Crypto", icon: "C" },
  { scope: "real-estate", label: "Real Estate", icon: "R" },
];

interface SidebarSection {
  title: string;
  items: { tab: DecisionTab; label: string }[];
}

const SECTIONS: SidebarSection[] = [
  {
    title: "ANALYSIS",
    items: [
      { tab: "command-center", label: "Command Center" },
      { tab: "trap-detector", label: "Trap Detector" },
      { tab: "machine-forecasts", label: "Machine Forecasts" },
    ],
  },
  {
    title: "RESEARCH",
    items: [
      { tab: "history-rhymes", label: "History Rhymes" },
      { tab: "calibration", label: "Calibration" },
      { tab: "research-briefs", label: "Research Briefs" },
    ],
  },
  {
    title: "PORTFOLIO",
    items: [
      { tab: "paper-portfolio", label: "Paper Portfolio" },
    ],
  },
];

export function DecisionEngineSidebar({
  activeTab,
  assetScope,
  onTabChange,
  onScopeChange,
}: DecisionEngineSidebarProps) {
  return (
    <nav className="w-56 shrink-0 border-r border-bm-border/50 bg-bm-bg/50 overflow-y-auto">
      <div className="p-4 space-y-6">
        {/* Scope selector */}
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-bm-muted2 mb-2">
            SCOPE
          </p>
          <div className="space-y-0.5">
            {SCOPE_ITEMS.map(({ scope, label, icon }) => (
              <button
                key={scope}
                onClick={() => onScopeChange(scope)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left text-xs transition-colors ${
                  assetScope === scope
                    ? "bg-bm-accent/10 text-bm-accent border-l-2 border-bm-accent"
                    : "text-bm-muted hover:text-bm-text hover:bg-bm-surface/30 border-l-2 border-transparent"
                }`}
              >
                <span className="font-mono text-[10px] font-bold w-4 text-center opacity-60">
                  {icon}
                </span>
                <span className="font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-bm-border/30" />

        {/* Tab sections */}
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="font-mono text-[10px] uppercase tracking-wider text-bm-muted2 mb-2">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map(({ tab, label }) => (
                <button
                  key={tab}
                  onClick={() => onTabChange(tab)}
                  className={`w-full flex items-center px-3 py-2 rounded-md text-left text-xs transition-colors ${
                    activeTab === tab
                      ? "bg-bm-accent/10 text-bm-accent border-l-2 border-bm-accent"
                      : "text-bm-muted hover:text-bm-text hover:bg-bm-surface/30 border-l-2 border-transparent"
                  }`}
                >
                  <span className="font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
