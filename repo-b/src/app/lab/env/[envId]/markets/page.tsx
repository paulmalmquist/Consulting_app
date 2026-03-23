"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RegimeClassifierWidget } from "@/components/market/RegimeClassifierWidget";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import type {
  BuildQueueCard,
  IntelCard,
  MarketLandingFeed,
  RotationTarget,
  SourceRef,
} from "@/lib/market-intelligence/types";

type MarketSegment = {
  segment_id: string;
  category: "equities" | "crypto" | "derivatives" | "macro";
  subcategory: string;
  segment_name: string;
  tier: number;
  rotation_priority_score: number;
  last_rotated_at: string | null;
  rotation_cadence_days: number;
  is_active: boolean;
  cross_vertical: Record<string, unknown>;
};

type IntelBrief = {
  brief_id: string;
  segment_id: string;
  run_date: string;
  regime_tag: string | null;
  composite_score: number | null;
  key_findings: unknown[];
  cross_vertical_insights: Record<string, unknown>;
};

type FeatureCard = {
  card_id: string;
  segment_id: string | null;
  gap_category: string;
  title: string;
  description: string | null;
  priority_score: number;
  cross_vertical_flag: boolean;
  status: string;
  created_at: string;
};

type DatabaseLoad = {
  segments: MarketSegment[];
  briefs: IntelBrief[];
  featureCards: FeatureCard[];
  loaded: boolean;
  notice: string | null;
};

const REGIME_COLORS: Record<string, string> = {
  RISK_ON_MOMENTUM: "#22c55e",
  RISK_ON_BROADENING: "#86efac",
  RISK_OFF_DEFENSIVE: "#f97316",
  RISK_OFF_PANIC: "#ef4444",
  TRANSITION_UP: "#3b82f6",
  TRANSITION_DOWN: "#f59e0b",
  RANGE_BOUND: "#8b5cf6",
  risk_on: "#22c55e",
  transitional: "#f59e0b",
  risk_off: "#f97316",
  stress: "#ef4444",
};

const CATEGORY_COLORS: Record<string, string> = {
  equities: "#4f46e5",
  crypto: "#ea580c",
  derivatives: "#0891b2",
  macro: "#059669",
};

const GAP_COLORS: Record<string, string> = {
  data_source: "#6366f1",
  calculation: "#8b5cf6",
  screening: "#3b82f6",
  visualization: "#06b6d4",
  backtesting: "#10b981",
  risk_model: "#f59e0b",
  alert: "#f97316",
  cross_vertical: "#ef4444",
};

const STATUS_COLORS: Record<string, string> = {
  identified: "#6b7280",
  spec_ready: "#3b82f6",
  in_progress: "#f59e0b",
  shipped: "#22c55e",
  planned: "#64748b",
  deferred: "#9ca3af",
};

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysAgo(value: string | null | undefined): number | null {
  if (!value) return null;
  return Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
}

function overdueRatio(segment: MarketSegment): number {
  const elapsedDays = daysAgo(segment.last_rotated_at) ?? 9_999;
  return elapsedDays / segment.rotation_cadence_days;
}

function regimeLabel(tag: string | null | undefined): string {
  if (!tag) return "Unknown";
  return tag.replace(/_/g, " ");
}

function scoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score)) return "#94a3b8";
  if (score >= 80) return "#1d4ed8";
  if (score >= 10) return "#4f46e5";
  if (score >= 7) return "#16a34a";
  if (score >= 4) return "#f59e0b";
  return "#ef4444";
}

function capFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

function formatPipelineSnippet(value: string | null | undefined): string {
  if (!value) return "Pipeline status not documented yet.";
  return value.length > 180 ? `${value.slice(0, 177)}...` : value;
}

function RegimeBadge({ tag }: { tag: string | null | undefined }) {
  const color = tag ? (REGIME_COLORS[tag] ?? "#94a3b8") : "#94a3b8";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      {regimeLabel(tag)}
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold" style={{ color: color ?? "#111827" }}>
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-xs text-gray-500">{sub}</p> : null}
    </div>
  );
}

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {count !== undefined ? (
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
          {count}
        </span>
      ) : null}
    </div>
  );
}

function IntelPanel({
  card,
  eyebrow,
  tone = "slate",
}: {
  card: IntelCard | null;
  eyebrow: string;
  tone?: "slate" | "amber" | "indigo" | "emerald";
}) {
  if (!card) return null;

  const toneClasses: Record<typeof tone, string> = {
    slate: "border-slate-200 bg-white",
    amber: "border-amber-200 bg-amber-50/70",
    indigo: "border-indigo-200 bg-indigo-50/70",
    emerald: "border-emerald-200 bg-emerald-50/70",
  };

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${toneClasses[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
        {eyebrow}
      </p>
      <h3 className="mt-2 text-base font-semibold text-gray-900">{card.title}</h3>
      <p className="mt-2 text-sm leading-6 text-gray-600">{card.summary}</p>
      {card.bullets.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {card.bullets.slice(0, 4).map((bullet) => (
            <li key={bullet} className="flex items-start gap-2 text-sm text-gray-700">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {card.impact ? (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white/80 px-3 py-3 text-sm text-gray-600">
          <span className="font-medium text-gray-900">Why it matters:</span> {card.impact}
        </div>
      ) : null}
    </div>
  );
}

function BuildQueueCardView({ card }: { card: BuildQueueCard }) {
  const badgeColor = STATUS_COLORS[card.status] ?? "#64748b";
  const priorityValue = Number(card.priority);
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
            Planned Build
          </p>
          <h3 className="mt-2 text-base font-semibold text-gray-900">{card.title}</h3>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white"
          style={{ backgroundColor: badgeColor }}
        >
          {card.status}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-gray-600">{card.summary}</p>
      <div className="mt-4 grid grid-cols-3 gap-3 text-xs text-gray-500">
        <div>
          <p className="uppercase tracking-wide text-gray-400">Priority</p>
          <p
            className="mt-1 text-sm font-semibold"
            style={{ color: Number.isNaN(priorityValue) ? "#111827" : scoreColor(priorityValue) }}
          >
            {card.priority}
          </p>
        </div>
        <div>
          <p className="uppercase tracking-wide text-gray-400">Effort</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">
            {card.estimatedEffort ?? "TBD"}
          </p>
        </div>
        <div>
          <p className="uppercase tracking-wide text-gray-400">Segment</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">
            {card.segment ?? "Market core"}
          </p>
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-gray-100 bg-slate-50 px-3 py-3 text-sm text-gray-600">
        <span className="font-medium text-gray-900">Why it matters:</span> {card.whyItMatters}
      </div>
    </div>
  );
}

function RotationTargetPills({ targets }: { targets: RotationTarget[] }) {
  if (targets.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {targets.map((target) => (
        <span
          key={`${target.segmentId || target.name}`}
          className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white/90"
        >
          {target.name}
        </span>
      ))}
    </div>
  );
}

function SourceTrail({ sources }: { sources: SourceRef[] }) {
  if (sources.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No markdown sources were detected. The page will rely on live DB widgets until the scheduled tasks write output.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {sources.slice(0, 10).map((source) => (
        <div
          key={`${source.label}-${source.path}`}
          className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm"
        >
          <div>
            <p className="font-medium text-gray-900">{source.label}</p>
            <p className="mt-1 font-mono text-xs text-gray-500">{source.path}</p>
          </div>
          {source.status && source.status !== "ok" ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              {source.status}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function DocsFallbackState({
  title,
  summary,
  bullets,
}: {
  title: string;
  summary: string;
  bullets: string[];
}) {
  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-6 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-gray-600">{summary}</p>
      {bullets.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-2 text-sm text-gray-700">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

async function fetchLandingFeed(): Promise<MarketLandingFeed> {
  const response = await fetch("/api/market-intelligence/landing", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Failed to load docs-backed market intelligence feed");
  }
  return (await response.json()) as MarketLandingFeed;
}

async function loadDatabaseData(): Promise<DatabaseLoad> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return {
      segments: [],
      briefs: [],
      featureCards: [],
      loaded: false,
      notice: "Supabase is not configured in this checkout, so the page is rendering the docs-backed intelligence layer only.",
    };
  }

  try {
    const [segmentResult, briefResult, cardResult] = await Promise.all([
      supabase
        .from("market_segments")
        .select("*")
        .eq("is_active", true)
        .order("rotation_priority_score", { ascending: false }),
      supabase
        .from("market_segment_intel_brief")
        .select(
          "brief_id,segment_id,run_date,regime_tag,composite_score,key_findings,cross_vertical_insights"
        )
        .order("run_date", { ascending: false })
        .limit(50),
      supabase
        .from("trading_feature_cards")
        .select(
          "card_id,segment_id,gap_category,title,description,priority_score,cross_vertical_flag,status,created_at"
        )
        .order("priority_score", { ascending: false })
        .limit(50),
    ]);

    if (segmentResult.error) throw segmentResult.error;
    if (briefResult.error) throw briefResult.error;
    if (cardResult.error) throw cardResult.error;

    return {
      segments: (segmentResult.data as MarketSegment[]) ?? [],
      briefs: (briefResult.data as IntelBrief[]) ?? [],
      featureCards: (cardResult.data as FeatureCard[]) ?? [],
      loaded: true,
      notice: null,
    };
  } catch (error) {
    return {
      segments: [],
      briefs: [],
      featureCards: [],
      loaded: false,
      notice:
        error instanceof Error
          ? `Live market tables could not be loaded. Showing the docs-backed landing instead. (${error.message})`
          : "Live market tables could not be loaded. Showing the docs-backed landing instead.",
    };
  }
}

export default function MarketIntelligencePage() {
  const params = useParams<{ envId: string }>();
  const envId = params?.envId ?? "";

  const [segments, setSegments] = useState<MarketSegment[]>([]);
  const [briefs, setBriefs] = useState<IntelBrief[]>([]);
  const [featureCards, setFeatureCards] = useState<FeatureCard[]>([]);
  const [landingFeed, setLandingFeed] = useState<MarketLandingFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dbNotice, setDbNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "overview" | "regime" | "segments" | "briefs" | "pipeline"
  >("overview");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDbNotice(null);

    const [feedResult, databaseResult] = await Promise.allSettled([
      fetchLandingFeed(),
      loadDatabaseData(),
    ]);

    let databaseLoaded = false;

    if (feedResult.status === "fulfilled") {
      setLandingFeed(feedResult.value);
    } else {
      setLandingFeed(null);
    }

    if (databaseResult.status === "fulfilled") {
      setSegments(databaseResult.value.segments);
      setBriefs(databaseResult.value.briefs);
      setFeatureCards(databaseResult.value.featureCards);
      databaseLoaded = databaseResult.value.loaded;
      setDbNotice(databaseResult.value.notice);
    } else {
      setSegments([]);
      setBriefs([]);
      setFeatureCards([]);
      setDbNotice("Live market tables could not be loaded. Showing docs-backed intelligence instead.");
    }

    if (feedResult.status === "rejected" && !databaseLoaded) {
      setError("Neither the docs-backed feed nor the live market tables could be loaded.");
    }

    if (feedResult.status === "rejected" && databaseLoaded) {
      setDbNotice("Live market tables loaded, but the docs-backed intelligence feed is currently unavailable.");
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const latestRegime = briefs[0]?.regime_tag ?? landingFeed?.status.regimeLabel ?? null;
  const topFeatureCard = featureCards[0];
  const latestBrief = briefs[0];
  const rotationTargets = landingFeed?.rotation.selectedSegments ?? [];
  const buildQueue = landingFeed?.buildQueue ?? [];
  const sourceNotes = landingFeed?.status.sourceHealthNotes ?? [];

  const categoryBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const segment of segments) {
      counts[segment.category] = (counts[segment.category] ?? 0) + 1;
    }
    return Object.entries(counts).map(([category, count]) => ({ category, count }));
  }, [segments]);

  const scoreHistory = useMemo(() => {
    const byDate: Record<string, number[]> = {};
    for (const brief of briefs) {
      if (brief.composite_score !== null) {
        byDate[brief.run_date] = byDate[brief.run_date] ?? [];
        byDate[brief.run_date].push(brief.composite_score);
      }
    }
    return Object.entries(byDate)
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(-14)
      .map(([date, scores]) => ({
        date,
        avg: +(scores.reduce((total, value) => total + value, 0) / scores.length).toFixed(2),
      }));
  }, [briefs]);

  const gapBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const card of featureCards) {
      counts[card.gap_category] = (counts[card.gap_category] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort(([, left], [, right]) => right - left)
      .map(([category, count]) => ({ category, count }));
  }, [featureCards]);

  const overdueSegments = segments.filter((segment) => overdueRatio(segment) > 1).length;
  const crossVerticalCount = featureCards.filter((card) => card.cross_vertical_flag).length;

  const competitiveSummary = useMemo(() => {
    if (landingFeed?.competitorWatch?.length) {
      return {
        title: "Competitor watch",
        summary: landingFeed.competitorWatch[0].summary,
        bullets: landingFeed.competitorWatch
          .slice(0, 3)
          .map((item) => `${item.title} — ${item.threat || item.summary}`),
      };
    }
    return null;
  }, [landingFeed]);

  const salesSummary = useMemo(() => {
    if (landingFeed?.salesPositioning?.length) {
      return {
        title: "Sales positioning",
        summary: landingFeed.salesPositioning[0].summary,
        bullets: landingFeed.salesPositioning
          .slice(0, 3)
          .flatMap((item) => [item.title, ...item.bullets.slice(0, 1)])
          .slice(0, 4),
      };
    }
    return null;
  }, [landingFeed]);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "regime", label: "Regime Classifier" },
    { id: "segments", label: "Segments" },
    { id: "briefs", label: "Intel Briefs" },
    { id: "pipeline", label: "Feature Pipeline" },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <div className="border-b border-gray-200 bg-white px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Market Intelligence Engine</h1>
            <p className="mt-1 text-sm text-gray-500">
              {landingFeed
                ? `${landingFeed.status.engineStatus} · ${formatPipelineSnippet(
                    landingFeed.status.pipelineState
                  )}`
                : "Docs-backed market landing with live regime and pipeline context."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <RegimeBadge tag={latestRegime} />
            <button
              onClick={() => void fetchData()}
              disabled={loading}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="mt-4 flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-indigo-600 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {dbNotice ? (
        <div className="mx-6 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {dbNotice}
        </div>
      ) : null}

      {loading ? (
        <div className="mx-6 mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-32 animate-pulse rounded-2xl bg-gray-200" />
          ))}
        </div>
      ) : null}

      {!loading ? (
        <div className="space-y-6 px-6 pt-6">
          {activeTab === "overview" ? (
            <>
              {landingFeed ? (
                <>
                  <div className="rounded-[28px] border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-900 p-6 text-white shadow-xl">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                      <div className="max-w-3xl">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">
                          Docs-Backed Landing
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <h2 className="text-2xl font-semibold tracking-tight">
                            {landingFeed.status.regimeLabel}
                          </h2>
                          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white/90">
                            {landingFeed.status.confidenceText}
                          </span>
                        </div>
                        <p className="mt-4 max-w-2xl text-sm leading-7 text-white/75">
                          {landingFeed.digest.regimeSummary ||
                            "The market landing is drawing from the repo’s scheduled intelligence output so this page stays useful even before the live research tables warm up."}
                        </p>
                        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-white/65">
                          <span>Latest digest: {fmtDate(landingFeed.status.latestDigestDate)}</span>
                          <span className="text-white/30">•</span>
                          <span>{landingFeed.status.engineStatus}</span>
                          <span className="text-white/30">•</span>
                          <span>{rotationTargets.length || segments.length} targets in focus</span>
                        </div>
                      </div>
                      <div className="space-y-3 lg:max-w-sm">
                        <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                            Pipeline State
                          </p>
                          <p className="mt-2 text-sm leading-6 text-white/80">
                            {landingFeed.status.pipelineState}
                          </p>
                        </div>
                        {sourceNotes.length > 0 ? (
                          <div className="rounded-2xl border border-white/15 bg-black/10 p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                              Source Health
                            </p>
                            <p className="mt-2 text-sm leading-6 text-white/75">
                              {sourceNotes[0]}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-6 border-t border-white/10 pt-5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                        First Rotation Targets
                      </p>
                      <div className="mt-3">
                        <RotationTargetPills targets={rotationTargets.slice(0, 6)} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <SectionHeader title="Today At A Glance" />
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <StatCard
                        label="Rotation Targets"
                        value={rotationTargets.length || segments.length}
                        sub={rotationTargets[0]?.name ? `Lead target: ${rotationTargets[0].name}` : "Waiting on next selection file"}
                        color="#4f46e5"
                      />
                      <StatCard
                        label="Pipeline State"
                        value={landingFeed.status.engineStatus}
                        sub={landingFeed.rotation.summary || "Cold-start pipeline is expected on first day."}
                        color="#111827"
                      />
                      <StatCard
                        label="Overdue Coverage"
                        value={
                          rotationTargets[0]?.overdueRatio ||
                          (overdueSegments > 0 ? `${overdueSegments} overdue` : "Cold start")
                        }
                        sub="Segments selected from the scheduler output"
                        color="#f97316"
                      />
                      <StatCard
                        label="Next Step"
                        value={landingFeed.rotation.nextStep || "Awaiting next sweep"}
                        sub={fmtDate(landingFeed.generatedAt)}
                        color="#0f766e"
                      />
                    </div>
                  </div>

                  <div>
                    <SectionHeader title="Live Intelligence Feed" />
                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr,0.8fr]">
                      <IntelPanel
                        card={landingFeed.dailyIntel}
                        eyebrow="Daily Intel"
                        tone="indigo"
                      />
                      <div className="space-y-5">
                        <DocsFallbackState
                          title={competitiveSummary?.title || "Competitor watch"}
                          summary={
                            competitiveSummary?.summary ||
                            "Competitor research hasn’t been generated yet."
                          }
                          bullets={competitiveSummary?.bullets || []}
                        />
                        <DocsFallbackState
                          title={salesSummary?.title || "Sales positioning"}
                          summary={
                            salesSummary?.summary ||
                            "Battlecard snippets will appear here once the sales positioning guide is present."
                          }
                          bullets={salesSummary?.bullets || []}
                        />
                      </div>
                    </div>
                    <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
                      <IntelPanel
                        card={landingFeed.featureRadar}
                        eyebrow="Feature Radar"
                        tone="amber"
                      />
                      <IntelPanel
                        card={landingFeed.demoAngle}
                        eyebrow="Demo Angle"
                        tone="emerald"
                      />
                    </div>
                  </div>

                  <div>
                    <SectionHeader title="Planned Builds" count={buildQueue.length} />
                    {buildQueue.length > 0 ? (
                      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
                        {buildQueue.map((card) => (
                          <BuildQueueCardView key={card.id} card={card} />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
                        No prompt-derived build cards were found yet.
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr,0.9fr]">
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                      <SectionHeader title="Pipeline Health" />
                      <p className="text-sm leading-7 text-gray-600">
                        {landingFeed.digest.pipelineHealthSummary ||
                          "The docs currently describe a cold-start pipeline, which means empty briefs and feature tables are expected until the first research sweep completes."}
                      </p>
                      {landingFeed.digest.crossVerticalAlertSummary ? (
                        <div className="mt-5 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-4 text-sm text-orange-900">
                          <span className="font-semibold">Cross-vertical alert:</span>{" "}
                          {landingFeed.digest.crossVerticalAlertSummary}
                        </div>
                      ) : null}
                      {sourceNotes.length > 0 ? (
                        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Why the page may look sparse
                          </p>
                          <ul className="mt-3 space-y-2">
                            {sourceNotes.slice(0, 4).map((note) => (
                              <li key={note} className="flex items-start gap-2 text-sm text-slate-700">
                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                                <span>{note}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                      <SectionHeader title="Source Trail" count={landingFeed.sources.length} />
                      <SourceTrail sources={landingFeed.sources} />
                    </div>
                  </div>
                </>
              ) : null}

              <div>
                <SectionHeader title="Live Table Signals" />
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <StatCard
                    label="Active Segments"
                    value={segments.length}
                    sub={
                      segments.length > 0
                        ? "Live segment registry"
                        : "Docs-backed landing is filling the cold-start gap"
                    }
                  />
                  <StatCard
                    label="Intel Briefs"
                    value={briefs.length}
                    sub={latestBrief ? `Last: ${fmtDate(latestBrief.run_date)}` : "No live briefs yet"}
                  />
                  <StatCard
                    label="Feature Cards"
                    value={featureCards.length}
                    sub={
                      featureCards.length > 0
                        ? `${crossVerticalCount} cross-vertical`
                        : `${buildQueue.length} prompt-derived cards in docs`
                    }
                    color="#6366f1"
                  />
                  <StatCard
                    label="Overdue Rotations"
                    value={overdueSegments}
                    sub={overdueSegments > 0 ? "Need research sweep" : "Cold-start expected"}
                    color={overdueSegments > 0 ? "#f97316" : "#22c55e"}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h3 className="mb-4 text-sm font-semibold text-gray-700">
                    Avg Composite Score — Last 14 Days
                  </h3>
                  {scoreHistory.length === 0 ? (
                    <p className="text-sm italic text-gray-400">
                      No live score history yet. The docs-backed feed above is the primary signal surface until the first briefs land.
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={scoreHistory}>
                        <defs>
                          <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(value) => value.slice(5)}
                        />
                        <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} width={30} />
                        <Tooltip
                          formatter={(value) => [`${value}`, "Avg Score"]}
                          labelFormatter={(label) => `Date: ${label}`}
                        />
                        <Area
                          type="monotone"
                          dataKey="avg"
                          stroke="#6366f1"
                          strokeWidth={2}
                          fill="url(#scoreGrad)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h3 className="mb-4 text-sm font-semibold text-gray-700">
                    Segments by Category
                  </h3>
                  {categoryBreakdown.length === 0 ? (
                    <p className="text-sm italic text-gray-400">
                      The live segment table is empty in this session. The rotation targets above are coming straight from the markdown scheduler output.
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={categoryBreakdown} barSize={40}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis dataKey="category" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 11 }} width={25} />
                        <Tooltip formatter={(value) => [`${value} segments`, "Count"]} />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {categoryBreakdown.map((entry) => (
                            <Cell
                              key={entry.category}
                              fill={CATEGORY_COLORS[entry.category] ?? "#6366f1"}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr,1fr]">
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h3 className="mb-4 text-sm font-semibold text-gray-700">
                    Feature Gaps by Category
                  </h3>
                  {gapBreakdown.length === 0 ? (
                    <p className="text-sm italic text-gray-400">
                      No live feature cards yet. The prompt-derived build queue above explains the next three cards that were planned in markdown.
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={gapBreakdown} layout="vertical" barSize={18}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#f3f4f6"
                          horizontal={false}
                        />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis
                          type="category"
                          dataKey="category"
                          tick={{ fontSize: 12 }}
                          tickFormatter={capFirst}
                          width={120}
                        />
                        <Tooltip
                          formatter={(value) => [`${value} cards`, "Count"]}
                          labelFormatter={capFirst}
                        />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                          {gapBreakdown.map((entry) => (
                            <Cell
                              key={entry.category}
                              fill={GAP_COLORS[entry.category] ?? "#6366f1"}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="space-y-6">
                  {latestBrief ? (
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-700">Latest Live Brief</h3>
                        <span className="text-xs text-gray-400">{fmtDate(latestBrief.run_date)}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <RegimeBadge tag={latestBrief.regime_tag} />
                        {latestBrief.composite_score !== null ? (
                          <span
                            className="text-lg font-bold"
                            style={{ color: scoreColor(latestBrief.composite_score) }}
                          >
                            {latestBrief.composite_score.toFixed(1)} / 10
                          </span>
                        ) : null}
                      </div>
                      {Array.isArray(latestBrief.key_findings) && latestBrief.key_findings.length > 0 ? (
                        <ul className="mt-3 space-y-1.5">
                          {(latestBrief.key_findings as string[]).slice(0, 4).map((finding) => (
                            <li key={finding} className="flex items-start gap-2 text-sm text-gray-600">
                              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                              {finding}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : landingFeed?.dailyIntel ? (
                    <IntelPanel
                      card={landingFeed.dailyIntel}
                      eyebrow="Cold-Start Briefing"
                      tone="slate"
                    />
                  ) : null}

                  {topFeatureCard ? (
                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-indigo-400">
                            Top Live Feature Card
                          </p>
                          <h3 className="mt-1 text-sm font-bold text-gray-900">
                            {topFeatureCard.title}
                          </h3>
                          {topFeatureCard.description ? (
                            <p className="mt-2 text-sm text-gray-600">{topFeatureCard.description}</p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-xl font-bold text-indigo-600">
                            {topFeatureCard.priority_score.toFixed(1)}
                          </p>
                          <p className="text-xs text-gray-400">priority</p>
                        </div>
                      </div>
                    </div>
                  ) : buildQueue[0] ? (
                    <BuildQueueCardView card={buildQueue[0]} />
                  ) : null}
                </div>
              </div>
            </>
          ) : null}

          {activeTab === "regime" ? (
            <div>
              <div className="mb-4">
                <h2 className="text-base font-semibold text-gray-900">Multi-Asset Regime Classifier</h2>
                <p className="mt-1 text-sm text-gray-500">
                  The live widget stays intact here. The docs-backed overview simply gives it better surrounding context when the research pipeline is still cold.
                </p>
              </div>
              <RegimeClassifierWidget compact={false} />
            </div>
          ) : null}

          {activeTab === "segments" ? (
            <div className="space-y-5">
              {rotationTargets.length > 0 ? (
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-5 shadow-sm">
                  <SectionHeader title="Docs-Backed Rotation Queue" count={rotationTargets.length} />
                  <p className="text-sm leading-6 text-gray-600">
                    {landingFeed?.rotation.summary ||
                      "These targets were surfaced by the markdown scheduler output and keep the page useful while the live segment table catches up."}
                  </p>
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    {rotationTargets.map((target) => (
                      <div
                        key={`${target.segmentId || target.name}`}
                        className="rounded-xl border border-indigo-100 bg-white px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-gray-900">{target.name}</p>
                            <p className="mt-1 text-xs font-mono text-gray-500">
                              {target.segmentId || "segment id pending"}
                            </p>
                          </div>
                          {target.category ? (
                            <span
                              className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                              style={{ backgroundColor: CATEGORY_COLORS[target.category] ?? "#6366f1" }}
                            >
                              {target.category}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
                          {target.tier ? <span>Tier {target.tier}</span> : null}
                          {target.overdueRatio ? <span>{target.overdueRatio}</span> : null}
                        </div>
                        {target.note ? (
                          <p className="mt-3 text-sm text-gray-600">{target.note}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="px-5 pt-5">
                  <SectionHeader title="Active Market Segments" count={segments.length} />
                </div>
                {segments.length === 0 ? (
                  <div className="px-5 pb-5">
                    <DocsFallbackState
                      title="Live segment table is still empty"
                      summary="The scheduled rotation files already point to concrete segments, so the landing page can still surface today’s priorities even before live DB rows start updating."
                      bullets={rotationTargets.map((target) => target.name)}
                    />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400">
                          <th className="px-4 py-3">Segment</th>
                          <th className="px-4 py-3">Category</th>
                          <th className="px-4 py-3">Tier</th>
                          <th className="px-4 py-3">Priority</th>
                          <th className="px-4 py-3">Last Rotated</th>
                          <th className="px-4 py-3">Cadence</th>
                          <th className="px-4 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {segments.map((segment) => {
                          const ratio = overdueRatio(segment);
                          const isOverdue = ratio > 1;
                          return (
                            <tr key={segment.segment_id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium text-gray-900">
                                {segment.segment_name}
                                {segment.cross_vertical &&
                                Object.keys(segment.cross_vertical).length > 0 ? (
                                  <span className="ml-2 rounded-full bg-orange-100 px-1.5 py-0.5 text-xs text-orange-600">
                                    CV
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                                  style={{
                                    backgroundColor:
                                      CATEGORY_COLORS[segment.category] ?? "#6366f1",
                                  }}
                                >
                                  {segment.category}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-gray-600">T{segment.tier}</td>
                              <td className="px-4 py-3 font-mono text-gray-700">
                                {segment.rotation_priority_score?.toFixed(1) ?? "—"}
                              </td>
                              <td className="px-4 py-3 text-gray-500">{fmtDate(segment.last_rotated_at)}</td>
                              <td className="px-4 py-3 text-gray-500">{segment.rotation_cadence_days}d</td>
                              <td className="px-4 py-3">
                                {isOverdue ? (
                                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                                    Overdue ({ratio.toFixed(1)}×)
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                                    Current
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {activeTab === "briefs" ? (
            <div className="space-y-5">
              {(landingFeed?.digest.regimeSummary || landingFeed?.dailyIntel) && (
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <SectionHeader title="Docs Context" />
                  <p className="text-sm leading-6 text-gray-600">
                    {landingFeed?.digest.regimeSummary ||
                      "No live briefs exist yet, so the landing page is using the latest digest and daily intelligence docs as the warm-start briefing."}
                  </p>
                  {landingFeed?.digest.topSignals.length ? (
                    <ul className="mt-4 space-y-2">
                      {landingFeed.digest.topSignals.slice(0, 4).map((signal) => (
                        <li key={signal} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                          <span>{signal}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}

              <SectionHeader title="Intelligence Briefs" count={briefs.length} />
              {briefs.length === 0 ? (
                <DocsFallbackState
                  title="No live intelligence briefs yet"
                  summary={
                    landingFeed?.digest.pipelineHealthSummary ||
                    "This environment is still in cold-start mode. The docs-backed landing keeps the regime, daily intel, and planned builds visible until the first research sweep writes brief rows."
                  }
                  bullets={[
                    ...(landingFeed?.dailyIntel?.bullets.slice(0, 2) || []),
                    ...(landingFeed?.competitorWatch.slice(0, 2).map((item) => item.title) || []),
                  ]}
                />
              ) : (
                briefs.map((brief) => (
                  <div
                    key={brief.brief_id}
                    className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-xs font-mono text-gray-400">{brief.segment_id}</span>
                          <RegimeBadge tag={brief.regime_tag} />
                          {brief.composite_score !== null ? (
                            <span
                              className="text-sm font-bold"
                              style={{ color: scoreColor(brief.composite_score) }}
                            >
                              {brief.composite_score.toFixed(1)} / 10
                            </span>
                          ) : null}
                        </div>
                        {Array.isArray(brief.key_findings) && brief.key_findings.length > 0 ? (
                          <ul className="mt-3 space-y-1">
                            {(brief.key_findings as string[]).slice(0, 3).map((finding) => (
                              <li
                                key={finding}
                                className="flex items-start gap-2 text-xs text-gray-600"
                              >
                                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-indigo-400" />
                                {finding}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {brief.cross_vertical_insights &&
                        Object.keys(brief.cross_vertical_insights).length > 0 ? (
                          <div className="mt-3 rounded-lg border border-orange-100 bg-orange-50 px-3 py-2">
                            <p className="mb-1 text-xs font-semibold text-orange-700">
                              Cross-vertical insights
                            </p>
                            {Object.entries(brief.cross_vertical_insights)
                              .slice(0, 2)
                              .map(([key, value]) => (
                                <p key={key} className="text-xs text-orange-600">
                                  <span className="font-medium capitalize">{key}:</span>{" "}
                                  {String(value)}
                                </p>
                              ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs text-gray-400">{fmtDate(brief.run_date)}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : null}

          {activeTab === "pipeline" ? (
            <div className="space-y-5">
              {buildQueue.length > 0 ? (
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <SectionHeader title="Prompt-Derived Build Queue" count={buildQueue.length} />
                  <p className="text-sm leading-6 text-gray-600">
                    The live `trading_feature_cards` table is still sparse, so these cards are coming from the repo’s feature planning markdown and the current codebase status.
                  </p>
                  <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
                    {buildQueue.map((card) => (
                      <BuildQueueCardView key={card.id} card={card} />
                    ))}
                  </div>
                </div>
              ) : null}

              <SectionHeader title="Feature Pipeline" count={featureCards.length} />
              {featureCards.length === 0 ? (
                <DocsFallbackState
                  title="No live feature cards yet"
                  summary={
                    landingFeed?.status.pipelineState ||
                    "The feature queue is still cold, but the build prompt docs already define the next cards to ship."
                  }
                  bullets={buildQueue.map((card) => `${card.title} (${card.status})`)}
                />
              ) : (
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400">
                        <th className="px-4 py-3">Title</th>
                        <th className="px-4 py-3">Gap Type</th>
                        <th className="px-4 py-3">Priority</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Flags</th>
                        <th className="px-4 py-3">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {featureCards.map((card) => (
                        <tr key={card.card_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="max-w-xs truncate font-medium text-gray-900" title={card.title}>
                              {card.title}
                            </p>
                            {card.description ? (
                              <p
                                className="max-w-xs truncate text-xs text-gray-400"
                                title={card.description}
                              >
                                {card.description}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                              style={{ backgroundColor: GAP_COLORS[card.gap_category] ?? "#6366f1" }}
                            >
                              {capFirst(card.gap_category)}
                            </span>
                          </td>
                          <td
                            className="px-4 py-3 font-mono font-bold"
                            style={{ color: scoreColor(card.priority_score) }}
                          >
                            {card.priority_score.toFixed(2)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                              style={{ backgroundColor: STATUS_COLORS[card.status] ?? "#6b7280" }}
                            >
                              {capFirst(card.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {card.cross_vertical_flag ? (
                              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                                CV
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(card.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
