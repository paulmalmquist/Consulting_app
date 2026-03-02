"use client";

/* ── UW vs Actual Scorecard Page ──────────────────────────────────
   Portfolio-level scorecard comparing underwritten vs actual metrics.
   Wrapped in Suspense for useSearchParams compatibility.
   ────────────────────────────────────────────────────────────────── */

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import { listReV1Funds, RepeFund } from "@/lib/bos-api";
import UwVsActualTable, {
  ScorecardRow,
} from "@/components/repe/reports/UwVsActualTable";
import { ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";

/* ── Types ─────────────────────────────────────────────────────── */

interface ScorecardResponse {
  rows: ScorecardRow[];
  fund_id: string;
  quarter: string;
  baseline: string;
  level: string;
  computed_at: string;
}

/* ── API helpers (inline until bos-api.ts is extended) ─────────── */

async function fetchScorecard(params: {
  fundId: string;
  asof: string;
  baseline: string;
  level: string;
}): Promise<ScorecardResponse> {
  const { bosFetch } = await import("@/lib/bos-api");
  return bosFetch("/api/re/v2/reports/uw-vs-actual", {
    params: {
      fundId: params.fundId,
      asof: params.asof,
      baseline: params.baseline,
      level: params.level,
    },
  });
}

/* ── Quarter helpers ──────────────────────────────────────────── */

function recentQuarters(count: number): string[] {
  const quarters: string[] = [];
  const now = new Date();
  let year = now.getFullYear();
  let q = Math.ceil((now.getMonth() + 1) / 3);
  // Start from previous quarter
  q -= 1;
  if (q <= 0) {
    q = 4;
    year -= 1;
  }
  for (let i = 0; i < count; i++) {
    quarters.push(`${year}Q${q}`);
    q -= 1;
    if (q <= 0) {
      q = 4;
      year -= 1;
    }
  }
  return quarters;
}

/* ── Inner component (uses useSearchParams) ───────────────────── */

function UwVsActualScorecardInner() {
  const { envId, businessId } = useReEnv();
  const router = useRouter();
  const searchParams = useSearchParams();

  const quarters = recentQuarters(8);

  const [funds, setFunds] = useState<RepeFund[]>([]);
  const [selectedFundId, setSelectedFundId] = useState(
    searchParams.get("fundId") || "",
  );
  const [asof, setAsof] = useState(
    searchParams.get("asof") || quarters[0],
  );
  const [baseline, setBaseline] = useState<"IO" | "CF">(
    (searchParams.get("baseline") as "IO" | "CF") || "IO",
  );
  const [level] = useState("investment");
  const [rows, setRows] = useState<ScorecardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingFunds, setLoadingFunds] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load funds
  useEffect(() => {
    if (!envId) return;
    listReV1Funds({ env_id: envId, business_id: businessId || undefined })
      .then((rows) => {
        setFunds(rows);
        if (!selectedFundId && rows[0]) {
          setSelectedFundId(rows[0].fund_id);
        }
      })
      .catch(() => setFunds([]))
      .finally(() => setLoadingFunds(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId]);

  // Fetch scorecard when filters change
  const loadScorecard = useCallback(async () => {
    if (!selectedFundId || !asof) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetchScorecard({
        fundId: selectedFundId,
        asof,
        baseline,
        level,
      });
      setRows(resp.rows);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load scorecard",
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [selectedFundId, asof, baseline, level]);

  useEffect(() => {
    void loadScorecard();
  }, [loadScorecard]);

  const handleRowClick = (row: ScorecardRow) => {
    const params = new URLSearchParams({
      asof,
      baseline,
    });
    router.push(
      `/lab/env/${envId}/re/reports/uw-vs-actual/investment/${row.investment_id}?${params.toString()}`,
    );
  };

  if (loadingFunds) {
    return (
      <div className="p-6 text-sm text-bm-muted2">Loading funds...</div>
    );
  }

  return (
    <section className="space-y-5" data-testid="uw-vs-actual-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-bm-muted2 mb-1">
            <Link
              href={`/lab/env/${envId}/re/reports`}
              className="hover:text-bm-text transition-colors inline-flex items-center gap-1"
            >
              <ArrowLeft size={12} />
              Reports
            </Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            UW vs Actual
          </h1>
          <p className="mt-1 text-sm text-bm-muted2">
            Compare underwritten projections against actual performance.
          </p>
        </div>
        <button
          onClick={loadScorecard}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-bm-border px-3 py-1.5 text-xs hover:bg-bm-surface/40 disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        {/* Fund */}
        <label className="flex-1 min-w-[180px]">
          <span className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Fund
          </span>
          <select
            className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            value={selectedFundId}
            onChange={(e) => setSelectedFundId(e.target.value)}
            data-testid="fund-select"
          >
            <option value="">Select fund</option>
            {funds.map((f) => (
              <option key={f.fund_id} value={f.fund_id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>

        {/* As-of Quarter */}
        <label className="min-w-[140px]">
          <span className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            As-of Quarter
          </span>
          <select
            className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            value={asof}
            onChange={(e) => setAsof(e.target.value)}
            data-testid="asof-select"
          >
            {quarters.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </label>

        {/* Baseline Toggle */}
        <div className="min-w-[140px]">
          <span className="text-xs uppercase tracking-[0.1em] text-bm-muted2 block">
            Baseline
          </span>
          <div className="mt-1 flex gap-1 rounded-lg border border-bm-border bg-bm-surface p-0.5">
            {(["IO", "CF"] as const).map((b) => (
              <button
                key={b}
                onClick={() => setBaseline(b)}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm transition ${
                  baseline === b
                    ? "bg-bm-accent text-white font-medium"
                    : "text-bm-muted2 hover:text-bm-text"
                }`}
                data-testid={`baseline-${b}`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        {/* Level (static for now) */}
        <label className="min-w-[140px]">
          <span className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Level
          </span>
          <select
            className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            value={level}
            disabled
            data-testid="level-select"
          >
            <option value="investment">Investment</option>
          </select>
        </label>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="p-6 text-sm text-bm-muted2">
          Loading scorecard...
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <UwVsActualTable rows={rows} onRowClick={handleRowClick} />
      )}
    </section>
  );
}

/* ── Exported page with Suspense boundary ─────────────────────── */

export default function UwVsActualScorecardPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-bm-muted2">Loading...</div>
      }
    >
      <UwVsActualScorecardInner />
    </Suspense>
  );
}
