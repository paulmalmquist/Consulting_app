"use client";

import { useState } from "react";
import { TimelineEngine } from "@/components/resume/timeline";
import SystemsBuiltSection from "@/components/resume/SystemsBuiltSection";
import ResumeModuleBoundary from "@/components/resume/ResumeModuleBoundary";
import ResumeChat from "./ResumeChat";

// ---------------------------------------------------------------------------
// KPI Data
// ---------------------------------------------------------------------------

const HERO_METRICS = [
  { label: "Reporting Acceleration", value: "10 days", sublabel: "faster quarterly reporting cycle" },
  { label: "Workflow Automation", value: "160 hrs", sublabel: "per month eliminated" },
  { label: "Pipeline Scale", value: "500+", sublabel: "properties through governed pipelines" },
  { label: "AUM Supported", value: "$4B+", sublabel: "by governed data systems" },
  { label: "Career Span", value: "11+", sublabel: "years building BI, data, and AI" },
];

const KPI_PROOF: Record<string, { what: string; source: string; before: string; after: string; system: string }> = {
  "Reporting Acceleration": {
    what: "Time from period close to published fund-level reports delivered to investor relations",
    source: "Measured against 2022 baseline before Tabular semantic layer deployment at Kayne Anderson",
    before: "20 business days — manual Excel pulls from MRI + DealCloud, ad-hoc SQL queries, manual reconciliation",
    after: "10 business days — automated via Databricks gold tables → Tabular → Power BI publish pipeline",
    system: "Semantic Layer (sys-semantic-layer) at Kayne Anderson Capital Advisors",
  },
  "Workflow Automation": {
    what: "Hours of recurring manual data entry, file retrieval, validation, and formatting work per month",
    source: "Measured from team time-tracking logs before/after Azure Logic Apps deployment (2019–2020)",
    before: "160+ hours/month across 3 analysts: file downloads from 500+ property portals, manual Excel formatting, copy-paste to MRI",
    after: "~30 min/month: automated ingestion via Logic Apps, PySpark transformation, SQL validation gates",
    system: "Ingestion Automation (sys-ingestion-automation) at Kayne Anderson",
  },
  "Pipeline Scale": {
    what: "Properties with automated, governed data ingestion — not manual data entry",
    source: "Scope of Azure Logic Apps + PySpark pipeline deployed 2019–2020 at Kayne Anderson",
    before: "Data collected manually by analysts from individual property portals and emailed spreadsheets",
    after: "500+ properties ingested automatically; SQL validation gates at every stage; near-zero manual entry errors",
    system: "Ingestion Automation (sys-ingestion-automation) at Kayne Anderson",
  },
  "AUM Supported": {
    what: "AUM for which investment decisions were backed by governed, validated data from the lakehouse",
    source: "Kayne Anderson real estate AUM at time of Data Warehouse deployment (2022)",
    before: "Fragmented source systems (DealCloud, MRI, Yardi, Excel); no single source of truth; DDQ responses took 10+ days",
    after: "Unified Databricks medallion lakehouse; DDQ turnaround cut 50%; all investor-facing data validated",
    system: "Data Warehouse (sys-warehouse) at Kayne Anderson",
  },
  "Career Span": {
    what: "Years building production data and analytics systems — from first BI deployment to current AI platform",
    source: "Aug 2014 (JLL BI service line) → present (JLL PDS Business Intelligence Lead)",
    before: "Ad-hoc BI requests, no repeatable delivery pipeline, no governed data layer",
    after: "8 systems in production across 2 firms: BI service line → data warehouse → semantic layer → AI platform",
    system: "See full timeline — from sys-bi-service-line (2014) to sys-ai-platform (2025)",
  },
};

function KpiProofBlock({ metric }: { metric: typeof HERO_METRICS[0] }) {
  const proof = KPI_PROOF[metric.label];
  if (!proof) return null;
  return (
    <div className="grid gap-4 text-left md:grid-cols-2 md:gap-6">
      <div className="space-y-3">
        <p className="text-[10px] font-semibold tracking-[0.12em] uppercase" style={{ color: "var(--ros-text-dim)" }}>
          What this measures
        </p>
        <p className="text-[13px] leading-[1.7] md:text-[12px]" style={{ color: "var(--ros-text-muted)" }}>
          {proof.what}
        </p>
        <p className="text-[10px] font-semibold tracking-[0.12em] uppercase" style={{ color: "var(--ros-text-dim)" }}>
          Source
        </p>
        <p className="text-[13px] leading-[1.7] md:text-[12px]" style={{ color: "var(--ros-text-muted)" }}>
          {proof.source}
        </p>
      </div>
      <div className="space-y-3">
        <p className="text-[10px] font-semibold tracking-[0.12em] uppercase" style={{ color: "var(--ros-text-dim)" }}>
          Before → After
        </p>
        <p className="text-[13px] leading-[1.7] md:text-[12px]" style={{ color: "var(--ros-text-muted)" }}>
          <span className="font-semibold" style={{ color: "var(--ros-text-dim)" }}>Before: </span>
          {proof.before}
        </p>
        <p className="text-[13px] leading-[1.7] md:text-[12px]" style={{ color: "var(--ros-text-muted)" }}>
          <span className="font-semibold" style={{ color: "var(--ros-accent-warm)" }}>After: </span>
          {proof.after}
        </p>
        <p className="text-[10px] font-semibold tracking-[0.12em] uppercase" style={{ color: "var(--ros-text-dim)" }}>
          System:{" "}
          <span style={{ color: "var(--ros-text)" }}>{proof.system}</span>
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PaulPage() {
  const [expandedKpi, setExpandedKpi] = useState<number | null>(null);

  return (
    <div className="resume-os relative overflow-hidden px-4 pt-8 md:px-8 md:pt-10 lg:px-12">
      {/* Atmospheric glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-[5%] top-0 h-[360px] w-[420px] rounded-full"
        style={{ background: "radial-gradient(ellipse, rgba(200,74,42,0.06) 0%, transparent 65%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[10%] top-[20%] h-[480px] w-[560px] rounded-full"
        style={{ background: "radial-gradient(ellipse, rgba(10,7,4,0.3) 0%, transparent 70%)" }}
      />
      {/* Grain overlay — reduced for light mode */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.10]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.07'/%3E%3C/svg%3E")`,
          backgroundSize: "128px 128px",
        }}
      />

      <div className="relative z-10 space-y-8 pb-20 md:space-y-12">

        {/* HERO — more breathing room on mobile */}
        <header className="pt-6 text-center md:pt-2">
          <h1
            className="resume-editorial text-[clamp(2.5rem,8vw,6rem)] uppercase leading-[1.05]"
            style={{
              color: "var(--ros-text-bright)",
              fontWeight: 500,
              letterSpacing: "0.1em",
            }}
          >
            Paul Malmquist
          </h1>
          <p
            className="mt-4 text-[clamp(13px,1.8vw,18px)] font-semibold tracking-[0.14em] uppercase"
            style={{ color: "var(--ros-text-muted)" }}
          >
            AI Data Platform Architect
            <span className="mx-2 hidden sm:inline" style={{ color: "var(--ros-text-dim)" }}>—</span>
            <br className="sm:hidden" />
            <span style={{ color: "var(--ros-accent-gold)" }}>Investment Systems</span>
          </p>
          <p
            className="mx-auto mt-4 max-w-xl text-[14px] leading-relaxed md:text-[15px]"
            style={{ color: "var(--ros-text-muted)" }}
          >
            Built governed data + AI systems powering investment decisions across $4B+ AUM
          </p>
          <p
            className="mt-3 text-[12px] tracking-[0.08em] md:text-[13px]"
            style={{ color: "var(--ros-text-dim)" }}
          >
            Brown University
          </p>
        </header>

        {/* KPI STRIP */}
        <div
          className="border-y py-6 text-center"
          style={{ borderColor: "var(--ros-border)" }}
        >
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-5 sm:gap-x-10 md:gap-x-14">
            {HERO_METRICS.map((m, i) => (
              <div key={m.label} className="flex items-center">
                {i > 0 && (
                  <span
                    className="mr-6 hidden select-none sm:mr-10 sm:inline md:mr-14"
                    style={{ color: "var(--ros-text-dim)" }}
                  >
                    |
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setExpandedKpi(expandedKpi === i ? null : i)}
                  className="flex flex-col items-center gap-1 transition-opacity hover:opacity-90"
                >
                  <span
                    className="resume-editorial text-[clamp(1.8rem,4vw,3.2rem)] leading-none"
                    style={{ color: "var(--ros-text-bright)" }}
                  >
                    {m.value}
                  </span>
                  <span
                    className="text-[11px] font-semibold tracking-[0.14em] uppercase"
                    style={{ color: "var(--ros-text-dim)" }}
                  >
                    {m.label}
                  </span>
                  <span
                    className="text-[11px] leading-snug"
                    style={{ color: "var(--ros-text-muted)" }}
                  >
                    {m.sublabel}
                  </span>
                </button>
              </div>
            ))}
          </div>
          {expandedKpi !== null && (
            <div
              className="mx-auto mt-5 max-w-3xl border-t pt-5"
              style={{ borderColor: "var(--ros-border)" }}
            >
              <KpiProofBlock metric={HERO_METRICS[expandedKpi]} />
            </div>
          )}
        </div>

        {/* TIMELINE — stacked capability chart */}
        <ResumeModuleBoundary
          boundaryId="paul-timeline"
          eyebrow="Timeline"
          title="Timeline temporarily unavailable"
          message="The career arc could not render."
          resetKey="paul-timeline-v1"
        >
          <TimelineEngine />
        </ResumeModuleBoundary>

        {/* SYSTEMS IN PRODUCTION */}
        <SystemsBuiltSection />

        {/* CONTACT / CTA */}
        <footer className="border-t pb-4 pt-8 text-center" style={{ borderColor: "var(--ros-border)" }}>
          <p
            className="text-[11px] font-semibold tracking-[0.2em] uppercase"
            style={{ color: "var(--ros-text-dim)" }}
          >
            Currently at{" "}
            <span style={{ color: "var(--ros-accent-warm)" }}>JLL</span>
            {" "}·{" "}
            <span style={{ color: "var(--ros-text)" }}>PDS Business Intelligence Lead</span>
          </p>
          <p
            className="mt-3 text-[13px] leading-relaxed"
            style={{ color: "var(--ros-text-muted)" }}
          >
            <a
              href="mailto:paul.malmquist@jll.com"
              className="transition-colors hover:underline"
              style={{ color: "var(--ros-accent-gold)" }}
            >
              paul.malmquist@jll.com
            </a>
          </p>
        </footer>

      </div>

      <ResumeChat />
    </div>
  );
}
