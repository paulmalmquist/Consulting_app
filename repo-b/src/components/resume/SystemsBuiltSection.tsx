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
 * SystemsBuiltSection — standardized proof cards, mobile-first.
 *
 * Desktop: full grid with bullets visible.
 * Mobile: card-style entries with 1-2 visible bullets + expand/collapse.
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

/** Human-readable stack label per capability ID */
const STACK_LABEL: Record<string, string> = {
  python: "Python",
  sql: "SQL",
  databricks: "Databricks",
  azure: "Azure",
  power_bi: "Power BI",
  tableau: "Tableau",
  tabular: "Tabular",
  snowflake: "Snowflake",
  openai: "OpenAI",
  langchain: "LangChain",
  pyspark: "PySpark",
};

/** Max 3 bullets per system — progression narrative: primitive → automation → governance → systems → modeling → AI */
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
    "OpenAI orchestration on top of validated gold layer data",
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

  // Mobile: show first 2 bullets by default, rest on expand
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
            : "var(--ros-border, rgba(200,146,58,0.30))",
      }}
    >
      <div
        className="py-5 transition-colors duration-200 md:py-5"
        style={{
          background: isHighlighted
            ? "rgba(200,146,58,0.06)"
            : isRelatedToSkill
              ? "rgba(96,144,176,0.04)"
              : "transparent",
        }}
      >
        {/* Row 1: Title + Company */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <div
            className="h-1.5 w-1.5 shrink-0 self-center rounded-full"
            style={{ backgroundColor: company.primary }}
          />
          <h3
            className="resume-editorial font-medium leading-snug"
            style={{
              color: "var(--ros-text, #f0e0c0)",
              fontSize: "clamp(16px, 1.6vw, 19px)",
            }}
          >
            {system.name}
          </h3>
          <span
            className="resume-label text-[10px] tracking-[0.2em]"
            style={{ color: "var(--ros-text-dim, #b8a890)" }}
          >
            {system.company_label}
          </span>
        </div>

        {/* Row 2: Stack tags */}
        {stackLabels.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {stackLabels.map((lbl) => (
              <span
                key={lbl}
                className="resume-label rounded px-1.5 py-0.5 text-[9px] tracking-[0.18em]"
                style={{
                  color: "var(--ros-text-muted, #d8c4a8)",
                  border: "1px solid var(--ros-pill-border, rgba(180,160,120,0.50))",
                  background: "var(--ros-pill-bg, rgba(255,255,255,0.07))",
                }}
              >
                {lbl}
              </span>
            ))}
          </div>
        )}

        {/* Row 3: Outcome metric — consistently below tags on all screen sizes */}
        {outcome && (
          <p
            className="mt-2.5 text-[12px] font-medium leading-snug tracking-[0.02em] md:text-[11px]"
            style={{ color: "var(--ros-text, #f0e0c0)" }}
          >
            <span style={{ color: "var(--ros-accent-warm, #c84b2a)" }}>→ </span>
            {outcome}
          </p>
        )}

        {/* Row 4: Description */}
        <p
          className="mt-2 text-[13px] leading-[1.7] tracking-[0.02em] md:text-[12px] md:leading-[1.65]"
          style={{ color: "rgba(230,215,195,0.88)" }}
        >
          {system.description}
        </p>

        {/* Row 5: Bullets — visible on all breakpoints */}
        {visibleBullets.length > 0 && (
          <ul className="mt-3 space-y-2 md:mt-2 md:space-y-1">
            {visibleBullets.map((bullet) => (
              <li
                key={bullet}
                className="flex items-start gap-2.5 text-[12px] leading-[1.65] tracking-[0.02em] md:text-[11px] md:leading-snug md:gap-2"
                style={{ color: "var(--ros-text-muted, rgba(225,210,190,0.85))" }}
              >
                <span
                  className="mt-[7px] h-1 w-1 shrink-0 rounded-full md:mt-[5px]"
                  style={{ background: "var(--ros-text-dim, rgba(210,190,160,0.65))" }}
                />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Expand/collapse for additional bullets on mobile */}
        {hasMore && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="mt-2 block text-[11px] tracking-[0.04em] md:hidden"
            style={{ color: "var(--ros-accent-gold, #c8923a)", opacity: 0.8 }}
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

  // Most recent first — what he's doing now leads, earliest work trails
  const sortedSystems = [...SYSTEMS].sort((a, b) => b.curve_value - a.curve_value);

  // When a skill is selected, highlight systems that use that skill as a capability.
  const skillRelatedSystemIds = (() => {
    if (!selectedSkillId) return new Set<string>();
    return new Set(
      SYSTEMS.filter((s) => s.capabilities_used.includes(selectedSkillId)).map((s) => s.id),
    );
  })();

  return (
    <section>
      {/* Section header */}
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div>
          <p
            className="resume-label text-[10px] tracking-[0.32em]"
            style={{ color: "var(--ros-text-dim, #b8a890)" }}
          >
            <span style={{ color: "var(--ros-text, #f0e0c0)" }}>Systems</span>{" "}
            in Production
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-4 md:flex">
          <span
            className="resume-label flex items-center gap-1.5 text-[10px] tracking-[0.2em]"
            style={{ color: "var(--ros-text-dim, #b8a890)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: COMPANY_COLORS.jll.primary }} />
            JLL
          </span>
          <span
            className="resume-label flex items-center gap-1.5 text-[10px] tracking-[0.2em]"
            style={{ color: "var(--ros-text-dim, #b8a890)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: COMPANY_COLORS.kayne.primary }} />
            Kayne
          </span>
        </div>
      </div>

      {/* System entries */}
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
