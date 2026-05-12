"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import ResumeModuleBoundary from "./ResumeModuleBoundary";
import { EvidenceCapabilityTable } from "./EvidenceCapabilityTable";
import { EvidenceFilterBar, type FilterState } from "./EvidenceFilterBar";
import { EvidenceGapTracker } from "./EvidenceGapTracker";
import { ProofArtifactCard } from "./ProofArtifactCard";
import {
  CAPABILITIES,
  GAP_ITEMS,
  PROOF_ARTIFACTS,
  controlLabel,
  credibilityScore,
  demoableArtifactCount,
  enterpriseReadiness,
  evidenceMix,
  namedGapsWithPlans,
  type Capability,
  type EvidenceStatus,
} from "./evidenceGraphData";

const MIX_COLOR: Record<EvidenceStatus, string> = {
  Production: "var(--ros-accent-gold)",
  Winston: "var(--ros-accent-warm)",
  Prototype: "rgba(208,85,48,0.45)",
  Advisory: "var(--ros-text-muted)",
  Gap: "var(--ros-text-dim)",
};

const MIX_ORDER: EvidenceStatus[] = ["Production", "Winston", "Prototype", "Advisory", "Gap"];

function emptyFilters(): FilterState {
  return { roles: new Set(), statuses: new Set(), domains: new Set() };
}

function filterRows(rows: Capability[], f: FilterState): Capability[] {
  return rows.filter((r) => {
    if (f.roles.size > 0 && !r.roleTargets.some((t) => f.roles.has(t))) return false;
    if (f.statuses.size > 0 && !f.statuses.has(r.status)) return false;
    if (f.domains.size > 0 && !r.domain.some((d) => f.domains.has(d))) return false;
    return true;
  });
}

function EvidenceMixBar({ mix }: { mix: Record<EvidenceStatus, number> }) {
  const total = MIX_ORDER.reduce((sum, k) => sum + mix[k], 0);
  if (total === 0) return null;
  return (
    <div className="w-full max-w-[260px]">
      <div
        className="flex h-[6px] w-full overflow-hidden rounded-sm"
        style={{ border: "1px solid var(--ros-border)" }}
      >
        {MIX_ORDER.map((status) => {
          const v = mix[status];
          if (v === 0) return null;
          return (
            <span
              key={status}
              className="h-full block"
              style={{
                width: `${(v / total) * 100}%`,
                background: MIX_COLOR[status],
              }}
              aria-label={`${status} ${v}`}
            />
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        {MIX_ORDER.filter((s) => mix[s] > 0).map((status, i) => (
          <span
            key={status}
            className="text-[10px] tracking-[0.1em] uppercase"
            style={{ color: "var(--ros-text-muted)" }}
          >
            {i > 0 && (
              <span aria-hidden className="mr-2" style={{ color: "var(--ros-text-dim)" }}>
                ·
              </span>
            )}
            <span style={{ color: MIX_COLOR[status] }}>{mix[status]}</span>{" "}
            <span style={{ color: "var(--ros-text-dim)" }}>{status}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function KpiTile({
  value,
  label,
  sub,
  children,
}: {
  value?: string;
  label: string;
  sub: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      {children ?? (
        <span
          className="resume-editorial text-[clamp(1.6rem,3.6vw,2.8rem)] leading-none"
          style={{ color: "var(--ros-text-bright)" }}
        >
          {value}
        </span>
      )}
      <span
        className="text-[10px] font-semibold tracking-[0.18em] uppercase"
        style={{ color: "var(--ros-text-dim)" }}
      >
        {label}
      </span>
      <span className="max-w-[220px] text-[11px] leading-snug" style={{ color: "var(--ros-text-muted)" }}>
        {sub}
      </span>
    </div>
  );
}

function SectionDivider({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="border-t pt-8" style={{ borderColor: "var(--ros-border)" }}>
      <p
        className="text-[10px] font-semibold tracking-[0.2em] uppercase"
        style={{ color: "var(--ros-text-dim)" }}
      >
        {eyebrow}
      </p>
      <h2
        className="resume-editorial mt-2 text-[clamp(1.6rem,3vw,2.4rem)] leading-tight"
        style={{ color: "var(--ros-text-bright)" }}
      >
        {title}
      </h2>
      {sub && (
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed" style={{ color: "var(--ros-text-muted)" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

export default function EvidenceGraphPage() {
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => filterRows(CAPABILITIES, filters), [filters]);

  const score = useMemo(() => credibilityScore(filtered, GAP_ITEMS), [filtered]);
  const readiness = useMemo(() => enterpriseReadiness(filtered), [filtered]);
  const mix = useMemo(() => evidenceMix(filtered), [filtered]);
  const demoCount = useMemo(
    () => demoableArtifactCount(filtered, PROOF_ARTIFACTS),
    [filtered],
  );
  const gaps = useMemo(() => namedGapsWithPlans(GAP_ITEMS), []);

  return (
    <div className="resume-os relative overflow-hidden px-4 pt-8 md:px-8 md:pt-10 lg:px-12">
      {/* Atmospheric glows — match /paul */}
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
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.10]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.07'/%3E%3C/svg%3E")`,
          backgroundSize: "128px 128px",
        }}
      />

      <div className="relative z-10 mx-auto max-w-6xl space-y-10 pb-20 md:space-y-14">

        {/* Header */}
        <header className="pt-6 text-center md:pt-2">
          <p
            className="text-[11px] font-semibold tracking-[0.24em] uppercase"
            style={{ color: "var(--ros-text-dim)" }}
          >
            Paul Malmquist · Credibility Map
          </p>
          <h1
            className="resume-editorial mt-3 text-[clamp(2.2rem,7vw,4.8rem)] uppercase leading-[1.05]"
            style={{ color: "var(--ros-text-bright)", fontWeight: 500, letterSpacing: "0.08em" }}
          >
            Evidence Graph
          </h1>
          <p
            className="mx-auto mt-5 max-w-2xl text-[14px] leading-relaxed md:text-[15px]"
            style={{ color: "var(--ros-text-muted)" }}
          >
            A transparent map of my data engineering, finance, real estate, and AI platform experience. It
            separates shipped professional work, Winston platform work, prototypes, and active gaps.
          </p>
          <p
            className="mx-auto mt-3 max-w-2xl text-[12px] leading-relaxed"
            style={{ color: "var(--ros-text-dim)" }}
          >
            Production = shipped at Kayne Anderson or JLL · Winston = Novendor internal platform · Prototype = working but not enterprise-hardened · Advisory = consulted, not owned · Gap = honest, with a plan.
          </p>
        </header>

        {/* KPI strip */}
        <ResumeModuleBoundary
          boundaryId="evidence-kpis"
          eyebrow="Credibility KPIs"
          title="Credibility metrics unavailable"
          message="The KPI strip could not render."
          resetKey="evidence-kpis-v1"
        >
          <div
            className="border-y py-7"
            style={{ borderColor: "var(--ros-border)" }}
          >
            <div className="grid grid-cols-2 gap-y-8 md:grid-cols-5 md:gap-x-4">
              <KpiTile
                value={`${score.toFixed(1)} / 5`}
                label="Credibility Score"
                sub="Weighted toward shipped and demoable systems"
              />
              <KpiTile
                label="Evidence Mix"
                sub="Transparent split of shipped work vs active platform R&D"
              >
                <EvidenceMixBar mix={mix} />
              </KpiTile>
              <KpiTile
                value={`${Math.round(readiness.ratio * 100)}%`}
                label="Enterprise Readiness"
                sub={
                  readiness.weakestControl
                    ? `Weakest control: ${controlLabel(readiness.weakestControl)}`
                    : "Governance, observability, CI/CD, and auditability"
                }
              />
              <KpiTile
                value={`${demoCount}`}
                label="Demoable Artifacts"
                sub="Recruiter-safe sanitized walkthroughs"
              />
              <KpiTile
                value={`${gaps.withPlans} of ${gaps.total}`}
                label="Named Gaps with Plans"
                sub="Explicitly tracked instead of hand-waved"
              />
            </div>
          </div>
        </ResumeModuleBoundary>

        {/* Filter bar */}
        <ResumeModuleBoundary
          boundaryId="evidence-filters"
          eyebrow="Filters"
          title="Filter bar unavailable"
          message="The filter chips could not render."
          resetKey="evidence-filters-v1"
        >
          <EvidenceFilterBar filters={filters} onChange={setFilters} />
        </ResumeModuleBoundary>

        {/* Capability table */}
        <ResumeModuleBoundary
          boundaryId="evidence-table"
          eyebrow="Capabilities"
          title="Capability table unavailable"
          message="The capability list could not render."
          resetKey="evidence-table-v1"
        >
          <EvidenceCapabilityTable
            rows={filtered}
            expandedId={expandedId}
            onToggle={(id) => setExpandedId((cur) => (cur === id ? null : id))}
          />
        </ResumeModuleBoundary>

        {/* Gap tracker */}
        <ResumeModuleBoundary
          boundaryId="evidence-gap-tracker"
          eyebrow="Gap Tracker"
          title="Gap tracker unavailable"
          message="The gap tracker could not render."
          resetKey="evidence-gap-tracker-v1"
        >
          <section>
            <SectionDivider
              eyebrow="Gap Tracker"
              title="What I don't claim, and how I plan to close it"
              sub="Every gap below has a planned Winston implementation and a named proof artifact. Listed because pretending omniscience is not credible."
            />
            <div className="mt-6">
              <EvidenceGapTracker items={GAP_ITEMS} />
            </div>
          </section>
        </ResumeModuleBoundary>

        {/* Proof artifacts */}
        <ResumeModuleBoundary
          boundaryId="evidence-artifacts"
          eyebrow="Proof Artifacts"
          title="Proof artifacts unavailable"
          message="The proof artifact grid could not render."
          resetKey="evidence-artifacts-v1"
        >
          <section>
            <SectionDivider
              eyebrow="Proof Artifacts"
              title="Demoable systems"
              sub="Sanitized walkthroughs available for recruiters and technical interviewers."
            />
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              {PROOF_ARTIFACTS.map((a) => (
                <ProofArtifactCard key={a.id} artifact={a} />
              ))}
            </div>
          </section>
        </ResumeModuleBoundary>

        {/* Footer / back link */}
        <footer className="border-t pb-4 pt-8 text-center" style={{ borderColor: "var(--ros-border)" }}>
          <Link
            href="/paul"
            className="text-[11px] font-semibold tracking-[0.2em] uppercase transition-colors hover:underline"
            style={{ color: "var(--ros-accent-gold)" }}
          >
            ← Back to /paul
          </Link>
          <p className="mt-3 text-[12px] leading-relaxed" style={{ color: "var(--ros-text-muted)" }}>
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
    </div>
  );
}
