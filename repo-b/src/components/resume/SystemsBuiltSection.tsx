"use client";

import { useCallback, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  SYSTEMS,
  COMPANY_COLORS,
  type System,
} from "./timeline/timelineData";
import { useResumeWorkspaceStore } from "./useResumeWorkspaceStore";

/**
 * SystemsBuiltSection — proof cards, mobile-first.
 *
 * Mobile: vertical cards with 1-2 visible bullets + expand/collapse.
 * Desktop: same vertical list with all bullets shown.
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

const STACK_LABEL: Record<string, string> = {
  python: "Python",
  sql: "SQL",
  databricks: "Databricks",
  azure: "Azure",
  power_bi: "Power BI",
  tableau: "Tableau",
  tabular: "Tabular",
  snowflake: "Snowflake",
  openai: "GenAI",
  langchain: "LangChain",
  pyspark: "PySpark",
};

const BULLETS: Record<string, string[]> = {
  "sys-bi-service-line": [
    "Manual ad-hoc requests → repeatable SQL + Tableau delivery pipeline",
    "Executive-ready reporting for JPMC account from zero BI capability",
    "50+ stakeholders served without a formal data team",
  ],
  "sys-ingestion-automation": [
    "Manual property portal downloads → Azure Logic Apps + PySpark (500+ properties)",
    "SQL validation gates at every ingestion stage eliminated manual errors",
    "160 hrs/month analyst work → ~30 min automated",
  ],
  "sys-warehouse": [
    "Fragmented DealCloud, MRI, Yardi, Excel → single Databricks medallion lakehouse",
    "Governed bronze/silver/gold architecture with Unity Catalog",
    "DDQ turnaround cut 50% — investor-facing data fully validated",
  ],
  "sys-governance-framework": [
    "Ad-hoc validation → SQL contracts at ingestion, transform, and reporting layers",
    "Automated quality checks with alerting across all source systems",
    "100% investor-facing data covered by validation contracts",
  ],
  "sys-semantic-layer": [
    "Raw gold tables → standardized Tabular models with reusable DAX measures",
    "Power BI drill-through from fund to asset across 6 business units",
    "10-day faster quarterly reporting cycle vs. pre-automation baseline",
  ],
  "sys-waterfall-engine": [
    "Fragile Excel waterfalls → deterministic Python engine with full audit trace",
    "Reusable allocation logic across fund structures",
    "5 min → near-instant scenario analysis turnaround",
  ],
  "sys-gold-layer": [
    "Multi-client data delivery standardized on Unity Catalog medallion architecture",
    "10+ client accounts on one governed framework",
    "Enterprise methodology replacing ad-hoc per-client SQL",
  ],
  "sys-ai-platform": [
    "Governed semantic models → natural language query foundation via Databricks Genie",
    "GenAI orchestration on top of validated gold layer data",
    "Analyst-driven ad-hoc queries → system-driven insight surfacing",
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
  const [expanded, setExpanded] = useState(false);
  const company = COMPANY_COLORS[system.company];
  const outcome = OUTCOME_LINE[system.id];
  const bullets = BULLETS[system.id] ?? [];

  const stackLabels = system.capabilities_used
    .map((id) => STACK_LABEL[id])
    .filter(Boolean)
    .slice(0, 4);

  // Mobile: show first 2 bullets, rest behind expand
  const visibleBullets = expanded ? bullets : bullets.slice(0, 2);
  const hasMore = bullets.length > 2;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group w-full border-t text-left transition-all duration-200"
      style={{
        borderColor: isHighlighted
          ? "rgba(200,146,58,0.55)"
          : isRelatedToSkill
            ? "rgba(96,144,176,0.35)"
            : "var(--ros-border)",
      }}
    >
      <div
        className="px-1 py-5 transition-colors duration-200 md:px-0 md:py-5"
        style={{
          background: isHighlighted
            ? "rgba(200,146,58,0.06)"
            : isRelatedToSkill
              ? "rgba(96,144,176,0.04)"
              : "transparent",
        }}
      >
        {/* Title + Company — clear hierarchy */}
        <h3
          className="resume-editorial font-medium leading-snug"
          style={{
            color: "var(--ros-text-bright)",
            fontSize: "clamp(17px, 1.6vw, 20px)",
          }}
        >
          <span
            className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
            style={{ backgroundColor: company.primary }}
          />
          {system.name}
        </h3>

        <span
          className="mt-1 block text-[11px] font-semibold tracking-[0.1em] uppercase"
          style={{ color: "var(--ros-text-dim)" }}
        >
          {system.company_label}
        </span>

        {/* Stack tags */}
        {stackLabels.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {stackLabels.map((lbl) => (
              <span
                key={lbl}
                className="rounded px-1.5 py-0.5 text-[10px] font-medium tracking-[0.06em]"
                style={{
                  color: "var(--ros-text-muted)",
                  border: "1px solid var(--ros-pill-border)",
                  background: "var(--ros-pill-bg)",
                }}
              >
                {lbl}
              </span>
            ))}
          </div>
        )}

        {/* Outcome metric — bold, separated */}
        {outcome && (
          <p
            className="mt-3 text-[13px] font-semibold leading-snug md:text-[12px]"
            style={{ color: "var(--ros-text)" }}
          >
            <span style={{ color: "var(--ros-accent-warm)" }}>→ </span>
            {outcome}
          </p>
        )}

        {/* Description */}
        <p
          className="mt-2 text-[13px] leading-[1.75] md:text-[12px] md:leading-[1.65]"
          style={{ color: "var(--ros-text-muted)" }}
        >
          {system.description}
        </p>

        {/* Bullets — always visible, capped on mobile */}
        {visibleBullets.length > 0 && (
          <ul className="mt-3 space-y-2.5 md:mt-2 md:space-y-1.5">
            {visibleBullets.map((bullet) => (
              <li
                key={bullet}
                className="flex items-start gap-3 text-[13px] leading-[1.7] md:text-[11px] md:leading-[1.6] md:gap-2"
                style={{ color: "var(--ros-text-muted)" }}
              >
                <span
                  className="mt-[8px] h-1 w-1 shrink-0 rounded-full md:mt-[6px]"
                  style={{ background: "var(--ros-accent-warm)" }}
                />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Expand/collapse on mobile */}
        {hasMore && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="mt-2 block text-[12px] font-medium md:hidden"
            style={{ color: "var(--ros-accent-gold)" }}
          >
            {expanded ? "Show less" : `+${bullets.length - 2} more`}
          </button>
        )}
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

  const sortedSystems = [...SYSTEMS].sort((a, b) => b.curve_value - a.curve_value);

  const skillRelatedSystemIds = (() => {
    if (!selectedSkillId) return new Set<string>();
    return new Set(
      SYSTEMS.filter((s) => s.capabilities_used.includes(selectedSkillId)).map((s) => s.id),
    );
  })();

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p
          className="text-[11px] font-semibold tracking-[0.2em] uppercase"
          style={{ color: "var(--ros-text-dim)" }}
        >
          <span style={{ color: "var(--ros-text)" }}>Systems</span>{" "}
          in Production
        </p>
        <div className="hidden shrink-0 items-center gap-4 md:flex">
          <span
            className="flex items-center gap-1.5 text-[10px] font-medium tracking-[0.12em] uppercase"
            style={{ color: "var(--ros-text-dim)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: COMPANY_COLORS.jll.primary }} />
            JLL
          </span>
          <span
            className="flex items-center gap-1.5 text-[10px] font-medium tracking-[0.12em] uppercase"
            style={{ color: "var(--ros-text-dim)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: COMPANY_COLORS.kayne.primary }} />
            Kayne
          </span>
        </div>
      </div>

      <div>
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
