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

  const stackLabels = system.capabilities_used
    .map((id) => STACK_LABEL[id])
    .filter(Boolean)
    .slice(0, 4);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group w-full border-t text-left transition-all duration-200"
      style={{
        borderColor: isHighlighted
          ? "rgba(200,146,58,0.45)"
          : isRelatedToSkill
            ? "rgba(96,144,176,0.3)"
            : "rgba(200,146,58,0.15)",
      }}
    >
      <div
        className="grid grid-cols-[1fr_auto] gap-4 py-4 transition-colors duration-200 md:py-5"
        style={{
          background: isHighlighted
            ? "rgba(200,146,58,0.06)"
            : isRelatedToSkill
              ? "rgba(96,144,176,0.04)"
              : "transparent",
        }}
      >
        {/* Left — identity + stack + description */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <div
              className="h-1.5 w-1.5 shrink-0 self-center rounded-full"
              style={{ backgroundColor: company.primary }}
            />
            <h3
              className="resume-editorial text-[clamp(15px,1.6vw,19px)] font-medium leading-snug"
              style={{ color: "var(--ros-text, #f0e0c0)" }}
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

          {/* Stack tags */}
          {stackLabels.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {stackLabels.map((lbl) => (
                <span
                  key={lbl}
                  className="resume-label rounded px-1.5 py-0.5 text-[9px] tracking-[0.18em]"
                  style={{
                    color: "var(--ros-text-dim, #b8a890)",
                    border: "1px solid rgba(150,130,100,0.35)",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  {lbl}
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          <p
            className="mt-2 line-clamp-2 text-[11px] leading-relaxed tracking-[0.06em] md:text-[12px]"
            style={{ color: "rgba(200,186,168,0.85)" }}
          >
            {system.description}
          </p>

          {/* Bullets (compact, desktop only) */}
          {bullets.length > 0 && (
            <ul className="mt-2 hidden space-y-0.5 md:block">
              {bullets.map((bullet) => (
                <li
                  key={bullet}
                  className="flex items-start gap-2 text-[10px] leading-snug tracking-[0.04em]"
                  style={{ color: "rgba(200,186,168,0.65)" }}
                >
                  <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-[rgba(200,186,168,0.4)]" />
                  {bullet}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right — outcome metrics */}
        <div className="flex shrink-0 flex-col items-end justify-start gap-1.5 pt-0.5">
          {outcome && (
            <span
              className="resume-label text-right text-[10px] leading-snug tracking-[0.06em] md:text-[11px]"
              style={{ color: "var(--ros-text, #f0e0c0)" }}
            >
              <span style={{ color: "var(--ros-accent-warm, #c84b2a)" }}>• </span>
              {outcome}
            </span>
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

      {/* System entries — no card borders, divided by top borders */}
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
