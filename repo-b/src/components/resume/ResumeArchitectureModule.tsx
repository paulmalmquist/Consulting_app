"use client";

import { useState } from "react";
import type { ResumeArchitecture } from "@/lib/bos-api";
import ResumeFallbackCard from "./ResumeFallbackCard";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const ARCHITECTURE_STAGES = [
  {
    id: "source",
    name: "Source Systems",
    color: "#94a3b8",
    tools: ["MRI", "DealCloud", "Yardi", "Excel"],
    what: "Raw data at origin: property operating systems, investor CRM, financial statements, and manual spreadsheets from 500+ properties.",
    systems: "Ingestion Automation, Data Warehouse",
    outcome: null as string | null,
  },
  {
    id: "ingestion",
    name: "Ingestion / ETL",
    color: "#34d399",
    tools: ["Logic Apps", "PySpark", "SQL gates"],
    what: "Automated retrieval, transformation, and validation of source data. SQL validation gates block bad data at entry. Replaces 160 hrs/month of analyst work.",
    systems: "Ingestion Automation (sys-ingestion-automation)",
    outcome: "160 hrs/month eliminated; 500+ properties automated",
  },
  {
    id: "platform",
    name: "Data Platform",
    color: "#60a5fa",
    tools: ["Databricks", "Delta Lake", "Unity Catalog"],
    what: "Bronze/silver/gold medallion architecture on Databricks. Unity Catalog governs access and lineage. Single source of truth for $4B+ AUM.",
    systems: "Data Warehouse (sys-warehouse), Gold Layer (sys-gold-layer)",
    outcome: "$4B+ AUM governed; DDQ turnaround cut 50%",
  },
  {
    id: "semantic",
    name: "Semantic Layer",
    color: "#fbbf24",
    tools: ["Tabular", "DAX", "Data contracts"],
    what: "Reusable metric definitions and data contracts above the gold layer. Standardized DAX measures ensure fund KPIs mean the same thing across every report.",
    systems: "Semantic Layer (sys-semantic-layer), Governance Framework (sys-governance-framework)",
    outcome: "10-day faster reporting cycle; 100% investor data validated",
  },
  {
    id: "analytical",
    name: "Analytical Engines",
    color: "#f472b6",
    tools: ["Python", "Power BI", "SQL models"],
    what: "Deterministic calculation engines (waterfall, scenario analysis) and BI delivery layer. Python waterfall replaced fragile Excel; Power BI publishes from Tabular automatically.",
    systems: "Waterfall Engine (sys-waterfall-engine), BI Service Line, Semantic Layer",
    outcome: "5 min → near-instant scenario analysis",
  },
  {
    id: "ai",
    name: "AI / Interaction",
    color: "#c084fc",
    tools: ["OpenAI", "Genie", "LangChain"],
    what: "Natural language query layer on top of governed semantic models. Genie routes analyst questions to validated gold tables. OpenAI orchestration produces structured insights.",
    systems: "AI Platform (sys-ai-platform)",
    outcome: "Analyst-driven queries → system-driven insight surfacing",
  },
  {
    id: "outputs",
    name: "Executive Outputs",
    color: "#fb923c",
    tools: ["Fund reports", "DDQ packages", "Winston AI"],
    what: "Investor-ready fund reports, due diligence questionnaires, executive dashboards, and Winston AI conversational interface. All outputs trace back to governed source data.",
    systems: "All 8 production systems contribute here",
    outcome: "Full data lineage from source to investor report",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ArchitectureOperatingModel() {
  const [selectedStage, setSelectedStage] = useState<string | null>(null);

  const activeStage = selectedStage
    ? ARCHITECTURE_STAGES.find((s) => s.id === selectedStage) ?? null
    : null;

  return (
    <section
      className="rounded-[28px] border p-5 md:p-7"
      style={{
        borderColor: "var(--ros-border-light, rgba(200,146,58,0.18))",
        background: "var(--ros-card-bg, rgba(14,10,6,0.6))",
      }}
    >
      {/* Header */}
      <div className="mb-5">
        <p
          className="resume-label text-[9px] tracking-[0.3em]"
          style={{ color: "var(--ros-text-dim)" }}
        >
          Architecture
        </p>
        <h2
          className="mt-1 text-xl font-medium"
          style={{ color: "var(--ros-text)" }}
        >
          Governed data foundation to AI operating surface
        </h2>
        <p
          className="mt-1 text-[12px] leading-relaxed"
          style={{ color: "var(--ros-text-dim)" }}
        >
          Click any layer to see what it does, what it replaced, and what it produced.
        </p>
      </div>

      {/* Governance rail */}
      <div
        className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-2"
        style={{
          borderColor: "rgba(200,146,58,0.25)",
          background: "rgba(200,146,58,0.06)",
        }}
      >
        <span
          className="resume-label text-[9px] tracking-[0.22em]"
          style={{ color: "var(--ros-accent-gold, #c8923a)" }}
        >
          Governance
        </span>
        {[
          "Quality checks at every layer",
          "Metric definitions in Tabular",
          "Data contracts across sources",
          "Full audit trail",
        ].map((label) => (
          <span
            key={label}
            className="text-[10px]"
            style={{ color: "var(--ros-text-dim)" }}
          >
            · {label}
          </span>
        ))}
      </div>

      {/* 7 stage columns */}
      <div className="grid grid-cols-4 gap-2 md:grid-cols-7">
        {ARCHITECTURE_STAGES.map((stage, i) => {
          const isSelected = selectedStage === stage.id;
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => setSelectedStage(isSelected ? null : stage.id)}
              className="flex flex-col gap-1.5 rounded-xl p-3 text-left transition-all duration-200"
              style={{
                background: isSelected
                  ? `${stage.color}18`
                  : "rgba(255,255,255,0.04)",
                border: `1px solid ${isSelected ? stage.color + "50" : "rgba(255,255,255,0.08)"}`,
              }}
            >
              <div
                className="text-[9px] font-semibold uppercase tracking-[0.2em]"
                style={{ color: stage.color }}
              >
                {i + 1}
              </div>
              <div
                className="text-[11px] font-semibold leading-snug"
                style={{ color: "var(--ros-text)" }}
              >
                {stage.name}
              </div>
              <div
                className="text-[9px] leading-snug"
                style={{ color: "var(--ros-text-dim)" }}
              >
                {stage.tools.slice(0, 2).join(" · ")}
              </div>
            </button>
          );
        })}
      </div>

      {/* Stage detail panel */}
      {activeStage && (
        <div
          className="mt-3 rounded-2xl border p-4 transition-all duration-200"
          style={{
            borderColor: `${activeStage.color}30`,
            background: `${activeStage.color}08`,
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p
                className="resume-label text-[9px] tracking-[0.2em]"
                style={{ color: "var(--ros-text-dim)" }}
              >
                What it does
              </p>
              <p
                className="text-[12px] leading-relaxed"
                style={{ color: "var(--ros-text-muted)" }}
              >
                {activeStage.what}
              </p>
              <p
                className="resume-label mt-2 text-[9px] tracking-[0.2em]"
                style={{ color: "var(--ros-text-dim)" }}
              >
                Tools
              </p>
              <div className="flex flex-wrap gap-1">
                {activeStage.tools.map((tool) => (
                  <span
                    key={tool}
                    className="resume-label rounded px-1.5 py-0.5 text-[9px] tracking-[0.12em]"
                    style={{
                      color: "var(--ros-text-muted)",
                      border: "1px solid var(--ros-pill-border, rgba(180,160,120,0.50))",
                      background: "var(--ros-pill-bg, rgba(255,255,255,0.07))",
                    }}
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p
                className="resume-label text-[9px] tracking-[0.2em]"
                style={{ color: "var(--ros-text-dim)" }}
              >
                Systems that use this layer
              </p>
              <p
                className="text-[12px] leading-relaxed"
                style={{ color: "var(--ros-text-muted)" }}
              >
                {activeStage.systems}
              </p>
              {activeStage.outcome && (
                <>
                  <p
                    className="resume-label mt-2 text-[9px] tracking-[0.2em]"
                    style={{ color: "var(--ros-text-dim)" }}
                  >
                    Outcome
                  </p>
                  <p
                    className="text-[12px] leading-relaxed"
                    style={{ color: "var(--ros-accent-warm, #c84b2a)" }}
                  >
                    {activeStage.outcome}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Outcomes rail */}
      <div
        className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-2"
        style={{
          borderColor: "rgba(200,74,42,0.2)",
          background: "rgba(200,74,42,0.05)",
        }}
      >
        <span
          className="resume-label text-[9px] tracking-[0.22em]"
          style={{ color: "var(--ros-accent-warm, #c84b2a)" }}
        >
          Outcomes
        </span>
        {[
          "10-day faster reporting",
          "160 hrs/month eliminated",
          "$4B+ AUM governed",
          "500+ properties automated",
        ].map((o) => (
          <span
            key={o}
            className="text-[10px]"
            style={{ color: "var(--ros-text-dim)" }}
          >
            · {o}
          </span>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Default export — keeps the same prop signature for API compat
// ---------------------------------------------------------------------------

export default function ResumeArchitectureModule({
  architecture,
}: {
  architecture: ResumeArchitecture;
}) {
  if (!architecture) {
    return (
      <ResumeFallbackCard
        eyebrow="Architecture"
        title="Visualization failed to render"
        body="The architecture layer does not have enough normalized node data to draw a safe system map."
        tone="warning"
      />
    );
  }

  return <ArchitectureOperatingModel />;
}
