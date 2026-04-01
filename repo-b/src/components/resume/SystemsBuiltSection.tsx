"use client";

import { useCallback, useState } from "react";
import {
  SYSTEMS,
  COMPANY_COLORS,
  type System,
  type CompanyId,
} from "./timeline/timelineData";

/**
 * SystemsBuiltSection — dedicated proof section showing every real system
 * Paul has built, with clickable drill-down into how/why/outcome.
 *
 * Data source: SYSTEMS array from timelineData.ts (no hardcoded UI strings).
 */

const HERO_METRICS_MAP: Record<string, string> = {
  "sys-ingestion-automation": "160 hrs/month → 30 min",
  "sys-warehouse": "50% faster DDQ turnaround",
  "sys-semantic-layer": "10-day faster reporting",
  "sys-waterfall-engine": "5 min → near-instant",
  "sys-ai-platform": "Self-serve analytics",
  "sys-governance-framework": "100% investor-facing validation",
  "sys-gold-layer": "10+ clients standardized",
  "sys-bi-service-line": "BI capability from zero",
};

function SystemCard({
  system,
  isExpanded,
  onToggle,
}: {
  system: System;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const company = COMPANY_COLORS[system.company];
  const heroMetric = HERO_METRICS_MAP[system.id] ?? system.metrics[0]?.value ?? "";

  return (
    <article
      className={`rounded-2xl border transition-all duration-200 ${
        isExpanded
          ? "border-white/15 bg-bm-surface/40 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.6)]"
          : "border-bm-border/30 bg-bm-surface/20 hover:border-white/10 hover:bg-bm-surface/30"
      }`}
    >
      {/* Collapsed header — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 p-4 text-left md:gap-4 md:p-5"
      >
        {/* Company indicator */}
        <div
          className="mt-0.5 h-2 w-2 shrink-0 rounded-full md:mt-1"
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
          <p className="mt-1 text-xs leading-relaxed text-bm-muted md:text-sm">
            {system.description}
          </p>
          {/* Headline metric — always visible for quick scan */}
          {heroMetric && (
            <span
              className="mt-2 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium"
              style={{
                backgroundColor: `${company.primary}15`,
                color: `${company.primary}CC`,
                border: `1px solid ${company.primary}25`,
              }}
            >
              {heroMetric}
            </span>
          )}
        </div>
        {/* Expand indicator */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className={`shrink-0 text-bm-muted transition-transform duration-200 ${
            isExpanded ? "rotate-180" : ""
          }`}
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Expanded detail — how it works, why it matters, metrics */}
      {isExpanded && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200 border-t border-white/5 px-4 pb-5 pt-4 md:px-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-sky-400/15 bg-sky-500/6 p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-sky-300/70">
                How It Works
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-white/70">
                {system.how_it_works}
              </p>
            </div>
            <div className="rounded-xl border border-amber-400/15 bg-amber-500/6 p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-amber-300/70">
                Why It Matters
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-white/70">
                {system.why_it_matters}
              </p>
            </div>
          </div>

          {/* Metrics */}
          {system.metrics.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {system.metrics.map((metric, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-white/8 bg-white/3 px-3 py-2"
                >
                  <p className="text-[10px] uppercase tracking-wide text-white/40">
                    {metric.label}
                  </p>
                  <p
                    className="mt-0.5 text-sm font-semibold"
                    style={{ color: company.primary }}
                  >
                    {metric.value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Capabilities used */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {system.capabilities_used.map((capId) => (
              <span
                key={capId}
                className="rounded-full border border-bm-border/25 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-bm-muted2"
              >
                {capId.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

export default function SystemsBuiltSection() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleToggle = useCallback((systemId: string) => {
    setExpandedId((prev) => (prev === systemId ? null : systemId));
  }, []);

  // Sort by curve_value (chronological build order)
  const sortedSystems = [...SYSTEMS].sort((a, b) => a.curve_value - b.curve_value);

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
          <p className="mt-1 max-w-2xl text-sm text-bm-muted">
            Each system solved a real operational problem — click to see how it was built and what it delivered.
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-2 text-xs text-bm-muted2 md:flex">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COMPANY_COLORS.jll.primary }} />
            JLL
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COMPANY_COLORS.kayne.primary }} />
            Kayne Anderson
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-2 md:mt-5">
        {sortedSystems.map((system) => (
          <SystemCard
            key={system.id}
            system={system}
            isExpanded={expandedId === system.id}
            onToggle={() => handleToggle(system.id)}
          />
        ))}
      </div>
    </section>
  );
}
