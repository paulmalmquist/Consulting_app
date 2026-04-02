"use client";

import { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  SYSTEMS,
  COMPANY_COLORS,
  type System,
} from "./timeline/timelineData";
import { useResumeWorkspaceStore } from "./useResumeWorkspaceStore";

/**
 * SystemsBuiltSection — standardized proof cards. Each card:
 *   title + 1-line description + max 3 bullets + 1 bold outcome
 *
 * Connected to the global store:
 * - highlightedSystemId from timeline interactions highlights a card
 * - selectedSkillId filters/emphasizes systems using that skill's capabilities
 */

const OUTCOME_LINE: Record<string, string> = {
  "sys-ingestion-automation": "160 hrs/month → 30 min automated",
  "sys-warehouse": "6+ systems → 1 governed lakehouse ($4B+ AUM)",
  "sys-semantic-layer": "10-day faster reporting across 6 business units",
  "sys-waterfall-engine": "5 min → near-instant scenario analysis",
  "sys-ai-platform": "Analyst-driven → system-driven insights",
  "sys-governance-framework": "100% investor-facing data validated",
  "sys-gold-layer": "10+ client accounts on one standard",
  "sys-bi-service-line": "BI capability built from zero for 50+ stakeholders",
};

/** Max 3 bullets per system — tightest proof points */
const BULLETS: Record<string, string[]> = {
  "sys-ingestion-automation": [
    "Azure Logic Apps + PySpark across 500+ properties",
    "SQL validation gates at every ingestion stage",
    "Near-zero manual entry errors",
  ],
  "sys-warehouse": [
    "Databricks medallion architecture (bronze/silver/gold)",
    "DealCloud, MRI, Yardi, Excel consolidated",
    "DDQ turnaround cut 50%",
  ],
  "sys-semantic-layer": [
    "Tabular models on Databricks gold tables",
    "Standardized DAX measures for fund KPIs",
    "Power BI drill-through from fund to asset",
  ],
  "sys-waterfall-engine": [
    "Deterministic Python engine replacing fragile Excel",
    "Full input-to-output audit trace",
    "Reusable allocation logic across fund structures",
  ],
  "sys-ai-platform": [
    "Databricks Genie + OpenAI orchestration",
    "Natural language queries on governed data",
    "Semantic models as query foundation",
  ],
  "sys-governance-framework": [
    "SQL validation at ingestion, transform, and reporting",
    "Automated quality checks with alerting",
    "Data contracts between all source systems",
  ],
  "sys-gold-layer": [
    "Unity Catalog governance in Databricks",
    "Medallion architecture for multi-tenant delivery",
    "Enterprise methodology standardization",
  ],
  "sys-bi-service-line": [
    "Tableau dashboards + SQL validation layers",
    "Repeatable delivery pipeline replacing ad hoc",
    "Executive-ready reporting for JPMC account",
  ],
};

function SystemCard({
  system,
  isHighlighted,
  isRelatedToSkill,
  onSelect,
}: {
  system: System;
  isHighlighted: boolean;
  isRelatedToSkill: boolean;
  onSelect: () => void;
}) {
  const company = COMPANY_COLORS[system.company];
  const outcome = OUTCOME_LINE[system.id];
  const bullets = BULLETS[system.id] ?? [];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border text-left transition-all duration-200 p-4 md:p-5 ${
        isHighlighted
          ? "border-white/20 bg-bm-surface/50 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.6)] ring-1 ring-white/10"
          : isRelatedToSkill
            ? "border-sky-400/20 bg-sky-500/5"
            : "border-bm-border/30 bg-bm-surface/20 hover:border-white/10 hover:bg-bm-surface/30"
      }`}
    >
      {/* Title row */}
      <div className="flex items-start gap-3">
        <div
          className="mt-1 h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: company.primary }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-sm font-semibold text-bm-text md:text-base">
              {system.name}
            </h3>
            <span className="text-[10px] uppercase tracking-wider text-bm-muted2">
              {system.company_label}
            </span>
          </div>

          {/* 1-line description */}
          <p className="mt-1 text-xs leading-relaxed text-bm-muted line-clamp-2 md:text-sm">
            {system.description}
          </p>

          {/* Max 3 bullets */}
          {bullets.length > 0 && (
            <ul className="mt-2 space-y-1">
              {bullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-2 text-[11px] leading-snug text-white/50 md:text-xs">
                  <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-white/25" />
                  {bullet}
                </li>
              ))}
            </ul>
          )}

          {/* Bold outcome line */}
          {outcome && (
            <p className="mt-2.5 text-xs font-semibold text-white/90 md:text-sm">
              {outcome}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

export default function SystemsBuiltSection() {
  const {
    highlightedSystemId,
    setHighlightedSystemId,
    selectedSkillId,
  } = useResumeWorkspaceStore(
    useShallow((s) => ({
      highlightedSystemId: s.highlightedSystemId,
      setHighlightedSystemId: s.setHighlightedSystemId,
      selectedSkillId: s.selectedSkillId,
    })),
  );

  const handleSelect = useCallback(
    (systemId: string) => {
      setHighlightedSystemId(highlightedSystemId === systemId ? null : systemId);
    },
    [highlightedSystemId, setHighlightedSystemId],
  );

  // Sort chronologically
  const sortedSystems = [...SYSTEMS].sort((a, b) => a.curve_value - b.curve_value);

  // When a skill is selected, highlight systems that use that skill as a capability.
  // Skill IDs (python, sql, databricks, etc.) match the capability IDs in system.capabilities_used.
  const skillRelatedSystemIds = (() => {
    if (!selectedSkillId) return new Set<string>();
    return new Set(
      SYSTEMS.filter((s) => s.capabilities_used.includes(selectedSkillId)).map((s) => s.id),
    );
  })();

  return (
    <section className="rounded-[20px] border border-bm-border/60 bg-bm-surface/18 p-3 shadow-[0_24px_64px_-48px_rgba(5,12,18,0.95)] md:rounded-[28px] md:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="bm-section-label tracking-[0.1em] md:tracking-[0.16em]">
            Systems Built
          </p>
          <h2 className="mt-1.5 text-lg font-semibold md:mt-2 md:text-xl">
            Production systems replacing manual workflows
          </h2>
        </div>
        <div className="hidden shrink-0 items-center gap-2 text-xs text-bm-muted2 md:flex">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COMPANY_COLORS.jll.primary }} />
            JLL
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COMPANY_COLORS.kayne.primary }} />
            Kayne
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-2 md:mt-5">
        {sortedSystems.map((system) => (
          <SystemCard
            key={system.id}
            system={system}
            isHighlighted={highlightedSystemId === system.id}
            isRelatedToSkill={skillRelatedSystemIds.has(system.id)}
            onSelect={() => handleSelect(system.id)}
          />
        ))}
      </div>
    </section>
  );
}
