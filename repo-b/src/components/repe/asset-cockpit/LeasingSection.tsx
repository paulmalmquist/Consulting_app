"use client";

import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import type {
  ReLeaseSummary, ReLeaseTenant, ReLeaseExpirationBucket,
  ReRentRollRow, ReLeaseDocument, ReLeaseEconomics,
} from "@/lib/bos-api";
import SectionHeader from "./shared/SectionHeader";
import HeroMetricCard from "./shared/HeroMetricCard";
import HorizontalBar from "./shared/HorizontalBar";
import SecondaryMetric from "./shared/SecondaryMetric";
import { BRIEFING_COLORS, BRIEFING_CONTAINER, BRIEFING_CARD } from "./shared/briefing-colors";
import { fmtMoney, fmtPct, fmtSfPsf } from "./format-utils";

/* ── helpers ──────────────────────────────────────────────────────────────── */

function fmtSf(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M SF`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K SF`;
  return `${v.toFixed(0)} SF`;
}

function yearsRemaining(expDate: string): number {
  const ms = new Date(expDate).getTime() - Date.now();
  return Math.max(ms / (365.25 * 24 * 3600 * 1000), 0);
}

function fmtYearsRemaining(expDate: string): string {
  const yr = yearsRemaining(expDate);
  if (yr < 1) return `${(yr * 12).toFixed(0)}mo`;
  return `${yr.toFixed(1)} yr`;
}

const DOC_TYPE_LABEL: Record<string, string> = {
  original_lease:      "Original Lease",
  amendment:           "Amendment",
  estoppel:            "Estoppel",
  snda:                "SNDA",
  assignment:          "Assignment",
  termination_notice:  "Termination Notice",
  rent_roll:           "Rent Roll",
};

const PARSER_STATUS_STYLE: Record<string, string> = {
  complete:       "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400",
  processing:     "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  failed:         "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  pending:        "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400",
  not_applicable: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400",
};

const LEASE_STATUS_STYLE: Record<string, string> = {
  active:    "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400",
  expired:   "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  holdover:  "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  pending:   "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  terminated:"bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400",
};

function Pill({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${className}`}>
      {label}
    </span>
  );
}

/* ── Section: Lease Summary Strip ─────────────────────────────────────────── */

function LeaseSummaryStrip({ summary }: { summary: ReLeaseSummary | null }) {
  const mtm = summary?.mark_to_market_pct != null ? Number(summary.mark_to_market_pct) : null;
  const mtmPct = mtm != null ? `${mtm >= 0 ? "+" : ""}${(mtm * 100).toFixed(1)}%` : "—";
  const mtmColor = mtm == null ? BRIEFING_COLORS.lineMuted : mtm >= 0 ? BRIEFING_COLORS.performance : "#ef4444";

  return (
    <div className={BRIEFING_CONTAINER}>
      <SectionHeader eyebrow="LEASE SUMMARY" title="Portfolio-Level Leasing KPIs" />
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <HeroMetricCard
          label="WALT"
          value={summary?.walt_years != null ? `${Number(summary.walt_years).toFixed(1)} yrs` : "—"}
          accent={BRIEFING_COLORS.performance}
        />
        <HeroMetricCard
          label="Physical Occupancy"
          value={summary?.physical_occupancy != null
            ? `${(Number(summary.physical_occupancy) * 100).toFixed(1)}%`
            : "—"}
          accent={BRIEFING_COLORS.performance}
        />
        <HeroMetricCard
          label="In-Place Rent PSF"
          value={fmtSfPsf(summary?.in_place_psf)}
          accent={BRIEFING_COLORS.capital}
        />
        <HeroMetricCard
          label="Annual Base Rent"
          value={fmtMoney(summary?.total_annual_base_rent)}
          accent={BRIEFING_COLORS.capital}
        />
        <HeroMetricCard
          label="Mark-to-Market"
          value={mtmPct}
          accent={mtmColor}
        />
      </div>
    </div>
  );
}

/* ── Section: Tenant Profile ──────────────────────────────────────────────── */

function TenantProfileReal({
  tenants,
  walt,
}: {
  tenants: ReLeaseTenant[];
  walt: number | null;
}) {
  return (
    <div className={BRIEFING_CONTAINER}>
      <SectionHeader eyebrow="TENANT PROFILE" title="Tenant & Lease Mix" />
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <HeroMetricCard
          label="Weighted Avg Lease Term"
          value={walt != null ? `${walt.toFixed(1)} yrs` : "—"}
          accent={BRIEFING_COLORS.performance}
          testId="tenant-walt"
        />
        <div className="space-y-4 lg:col-span-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
            Top Tenants by GLA
          </p>
          <div className="space-y-3">
            {tenants.map((t) => (
              <div key={t.lease_id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <HorizontalBar
                    label={t.name}
                    value={`${t.gla_pct}%`}
                    pct={t.gla_pct}
                    color={BRIEFING_COLORS.performance}
                  />
                </div>
                {t.is_anchor && (
                  <Pill label="Anchor" className="shrink-0 bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Section: Lease Expiration Schedule ───────────────────────────────────── */

function LeaseExpirationSchedule({ buckets }: { buckets: ReLeaseExpirationBucket[] }) {
  return (
    <div className={BRIEFING_CONTAINER}>
      <SectionHeader
        eyebrow="LEASE ROLLOVER"
        title="Lease Expiration Schedule"
        description="Percentage of GLA expiring by year"
      />
      <div className={`mt-5 ${BRIEFING_CARD}`}>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={buckets} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
            <XAxis
              dataKey="year"
              tick={{ fontSize: 11, fill: "#94A3B8" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 11, fill: "#94A3B8" }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              formatter={(v: number) => [`${v}%`, "Expiring"]}
              contentStyle={{
                background: "rgba(15,23,42,0.92)",
                border: "none",
                borderRadius: 12,
                fontSize: 12,
                color: "#e2e8f0",
              }}
            />
            <Bar dataKey="pct_expiring" radius={[6, 6, 0, 0]} maxBarSize={48}>
              {buckets.map((b) => (
                <Cell
                  key={b.year}
                  fill={b.pct_expiring >= 20 ? BRIEFING_COLORS.risk : BRIEFING_COLORS.performance}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ── Section: Rent Roll Table ─────────────────────────────────────────────── */

type SortKey = "sf" | "rent" | "expiry";

function RentRollTable({ rows }: { rows: ReRentRollRow[] }) {
  const [sort, setSort] = useState<SortKey>("sf");

  const sorted = [...rows].sort((a, b) => {
    if (sort === "sf")    return b.rentable_sf - a.rentable_sf;
    if (sort === "rent")  return b.base_rent_psf - a.base_rent_psf;
    if (sort === "expiry") return new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime();
    return 0;
  });

  function SortBtn({ k, label }: { k: SortKey; label: string }) {
    return (
      <button
        onClick={() => setSort(k)}
        className={`text-[10px] uppercase tracking-[0.14em] transition-colors ${
          sort === k ? "text-bm-text font-semibold" : "text-bm-muted2 hover:text-bm-text"
        }`}
      >
        {label}
      </button>
    );
  }

  if (rows.length === 0) {
    return (
      <div className={BRIEFING_CONTAINER}>
        <SectionHeader eyebrow="RENT ROLL" title="Current Rent Roll" />
        <p className="mt-4 text-sm text-bm-muted2">No active leases found.</p>
      </div>
    );
  }

  return (
    <div className={BRIEFING_CONTAINER}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader eyebrow="RENT ROLL" title="Current Rent Roll" />
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-bm-muted2 uppercase tracking-[0.14em]">Sort:</span>
          <SortBtn k="sf"    label="SF" />
          <SortBtn k="rent"  label="Rent PSF" />
          <SortBtn k="expiry" label="Expiry" />
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-white/10">
              {["Tenant", "Suite", "SF", "Lease Type", "Expiry", "Remaining", "PSF", "Annual Rent", "Options"].map((h) => (
                <th
                  key={h}
                  className={`pb-2 text-[10px] uppercase tracking-[0.14em] text-bm-muted2 font-medium ${
                    ["SF", "PSF", "Annual Rent"].includes(h) ? "text-right" : "text-left"
                  } pr-3 first:pl-0`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            {sorted.map((r) => (
              <tr
                key={r.lease_id}
                className={`transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.02] ${
                  r.is_anchor ? "border-l-2 border-l-amber-400" : ""
                }`}
              >
                <td className="py-3 pr-3 font-medium text-bm-text">
                  <div className="flex items-center gap-1.5">
                    {r.tenant_name}
                    {r.is_anchor && (
                      <Pill label="Anchor" className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" />
                    )}
                  </div>
                </td>
                <td className="py-3 pr-3 text-bm-muted2">{r.suite_number ?? "—"}</td>
                <td className="py-3 pr-3 text-right tabular-nums text-bm-text">
                  {r.rentable_sf.toLocaleString()}
                </td>
                <td className="py-3 pr-3">
                  <Pill
                    label={r.lease_type === "full_service" ? "Full Svc" : r.lease_type.toUpperCase()}
                    className="bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400"
                  />
                </td>
                <td className="py-3 pr-3 text-bm-muted2 tabular-nums">
                  {new Date(r.expiration_date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                </td>
                <td className="py-3 pr-3 text-bm-muted2 tabular-nums text-sm">
                  {fmtYearsRemaining(r.expiration_date)}
                </td>
                <td className="py-3 pr-3 text-right tabular-nums text-bm-text">
                  ${r.base_rent_psf.toFixed(2)}
                </td>
                <td className="py-3 pr-3 text-right tabular-nums text-bm-text">
                  {fmtMoney(r.annual_base_rent)}
                </td>
                <td className="py-3 pr-3">
                  <div className="flex flex-wrap gap-1">
                    {r.renewal_options && (
                      <Pill label="Renewal" className="bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400" />
                    )}
                    {r.expansion_option && (
                      <Pill label="Expand" className="bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400" />
                    )}
                    {r.termination_option && (
                      <Pill label="Term." className="bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Section: Rent Economics ──────────────────────────────────────────────── */

function RentEconomicsReal({ economics }: { economics: ReLeaseEconomics | null }) {
  if (!economics) return null;
  const isPositive = (economics.mark_to_market_pct ?? 0) >= 0;

  return (
    <div className={BRIEFING_CONTAINER}>
      <SectionHeader eyebrow="RENT ECONOMICS" title="Rent Analysis" />

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <SecondaryMetric label="Avg In-Place Rent PSF" value={fmtSfPsf(economics.in_place_psf)} />
        <SecondaryMetric label="Market Rent PSF"       value={fmtSfPsf(economics.market_rent_psf)} />
        <div
          className={`rounded-xl border px-4 py-3 ${
            isPositive
              ? "border-green-200 bg-green-50 dark:border-green-500/20 dark:bg-green-500/5"
              : "border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/5"
          }`}
        >
          <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Mark-to-Market</p>
          <p className={`mt-1 text-sm font-medium tabular-nums ${
            isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
          }`}>
            {isPositive ? "+" : ""}
            {economics.mark_to_market_pct != null
              ? `${(Number(economics.mark_to_market_pct) * 100).toFixed(1)}%`
              : "—"}
          </p>
        </div>
      </div>

      {economics.below_market_leases.length > 0 && (
        <div className="mt-5">
          <p className="mb-3 text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
            Below-Market Exposure
          </p>
          <div className="space-y-2">
            {economics.below_market_leases.map((bm) => (
              <div key={bm.tenant_name} className={`${BRIEFING_CARD} flex flex-wrap items-center justify-between gap-2`}>
                <div>
                  <p className="text-sm font-medium text-bm-text">{bm.tenant_name}</p>
                  <p className="text-xs text-bm-muted2">
                    {fmtSf(bm.rentable_sf)} · In-place: ${bm.in_place_psf.toFixed(2)} / SF
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                    −${bm.gap_psf.toFixed(2)}/SF
                  </p>
                  <p className="text-xs text-bm-muted2">
                    {fmtMoney(bm.annual_upside)}/yr upside at expiry
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Section: Lease Documents ─────────────────────────────────────────────── */

function LeaseDocumentsPanel({ documents }: { documents: ReLeaseDocument[] }) {
  return (
    <div className={BRIEFING_CONTAINER}>
      <SectionHeader eyebrow="LEASE DOCUMENTS" title="Documents & Extraction Status" />
      {/* TODO: wire future upload button here */}

      {documents.length === 0 ? (
        <p className="mt-4 text-sm text-bm-muted2">No lease documents on file.</p>
      ) : (
        <div className="mt-5 space-y-2">
          {documents.map((d) => (
            <div key={d.doc_id} className={`${BRIEFING_CARD} flex flex-wrap items-center justify-between gap-2`}>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-bm-text">{d.file_name}</p>
                <p className="text-xs text-bm-muted2">
                  {d.tenant_name} · {DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type}
                  {d.uploaded_at && (
                    <> · {new Date(d.uploaded_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {d.confidence != null && (
                  <span className="text-xs text-bm-muted2 tabular-nums">
                    {(d.confidence * 100).toFixed(0)}% confidence
                  </span>
                )}
                <Pill
                  label={d.parser_status.replace("_", " ")}
                  className={PARSER_STATUS_STYLE[d.parser_status] ?? PARSER_STATUS_STYLE.pending}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main export ──────────────────────────────────────────────────────────── */

export interface LeasingSectionProps {
  assetId:          string;
  summary:          ReLeaseSummary | null;
  tenants:          ReLeaseTenant[];
  walt:             number | null;
  expirationBuckets: ReLeaseExpirationBucket[];
  totalLeasedSf:    number;
  rentRoll:         ReRentRollRow[];
  documents:        ReLeaseDocument[];
  economics:        ReLeaseEconomics | null;
  loading?:         boolean;
}

export default function LeasingSection({
  summary,
  tenants,
  walt,
  expirationBuckets,
  rentRoll,
  documents,
  economics,
  loading,
}: LeasingSectionProps) {
  if (loading) {
    return (
      <div className="space-y-6">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className={`${BRIEFING_CONTAINER} animate-pulse`}
            style={{ height: i === 0 ? 160 : 260 }}
          />
        ))}
      </div>
    );
  }

  // Empty state: no leasing data available
  const hasData = summary != null || tenants.length > 0 || expirationBuckets.length > 0 || rentRoll.length > 0 || documents.length > 0;
  if (!hasData) {
    return (
      <div className={`${BRIEFING_CONTAINER} text-center py-12`}>
        <p className="text-sm text-bm-muted2">No leasing data available for this asset.</p>
        <p className="mt-2 text-xs text-bm-muted2/60">Upload a rent roll or connect a lease management source to populate.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI summary strip */}
      <LeaseSummaryStrip summary={summary} />

      {/* Tenant profile + expiration schedule */}
      {tenants.length > 0 && (
        <TenantProfileReal tenants={tenants} walt={walt} />
      )}

      {expirationBuckets.length > 0 && (
        <LeaseExpirationSchedule buckets={expirationBuckets} />
      )}

      {/* Rent roll */}
      <RentRollTable rows={rentRoll} />

      {/* Rent economics */}
      {economics && <RentEconomicsReal economics={economics} />}

      {/* Lease documents */}
      <LeaseDocumentsPanel documents={documents} />
    </div>
  );
}
