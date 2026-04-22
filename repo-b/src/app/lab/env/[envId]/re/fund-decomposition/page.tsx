"use client";

/**
 * Fund Decomposition — Gross Contribution Overlay.
 *
 * Product rules (see /Users/paulmalmquist/.claude/plans/you-are-working-inside-greedy-crane.md):
 *   - Page subtitle committing to overlay semantics is a product guarantee,
 *     pinned by a frontend test. Do not change the wording without updating
 *     the test.
 *   - Baseline strip reads from useAuthoritativeState (SINGLE FETCH LAYER,
 *     per docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md).
 *   - Overlay strip shows Gross IRR / TVPI / DPI only. Net IRR is
 *     intentionally absent here; it only appears in the baseline strip,
 *     greyed, because fund-level fees are not investment-dimensional.
 *   - Marginal contribution is a heuristic; the label says so every time.
 *   - Identity checks are surfaced as a chip; the panel auto-opens on a
 *     failing check.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS, fmtCompact } from "@/components/charts/chart-theme";
import { TrustChip } from "@/components/re/TrustChip";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import { useAuthoritativeState, isLockStateRenderable } from "@/hooks/useAuthoritativeState";
import {
  getFundDecomposition,
  getFundDecompositionCapabilities,
  listRepeFunds,
  type FundDecompositionApiError,
  type ReV2FundDecomposition,
  type ReV2FundDecompositionCapability,
  type ReV2FundDecompositionInvestment,
  type RepeFund,
} from "@/lib/bos-api";
import { publishAssistantPageContext, resetAssistantPageContext } from "@/lib/commandbar/appContextBridge";

const PAGE_SUBTITLE =
  "Gross contribution overlay. Explanatory analysis of the current fund at stated ownership — not a hypothetical alternate fund history.";

const NET_IRR_OVERLAY_LABEL =
  "Net IRR is baseline-only. It is not recomputed under selection because fund-level fees are not investment-dimensional.";

function pickCurrentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getUTCMonth() + 1) / 3);
  return `${now.getUTCFullYear()}Q${q}`;
}

function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

function fmtMultiple(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(2)}x`;
}

function fmtMoney(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return fmtCompact(v);
}

function isRealizedStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === "realized" || s === "sold" || s === "exited";
}

export default function FundDecompositionPage({
  params,
}: {
  params: { envId: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { envId, businessId } = useReEnv();
  const auditMode = searchParams?.get("audit_mode") === "1";
  const quarterFromUrl = searchParams?.get("quarter") || null;
  const fundFromUrl = searchParams?.get("fund") || null;
  const quarter = quarterFromUrl ?? pickCurrentQuarter();

  const [funds, setFunds] = useState<RepeFund[]>([]);
  const [fundId, setFundId] = useState<string | null>(fundFromUrl);
  const [decomp, setDecomp] = useState<ReV2FundDecomposition | null>(null);
  const [overlayLoading, setOverlayLoading] = useState<boolean>(false);
  /**
   * Typed overlay error. Distinct from the capability probe — this fires only
   * when a POST actually reached FastAPI and came back with an error_code.
   * The UI must switch on `errorCode`, never display the raw message alone.
   */
  const [overlayError, setOverlayError] = useState<
    { errorCode: string; message: string; detail?: Record<string, unknown> } | null
  >(null);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [identityOpen, setIdentityOpen] = useState<boolean>(false);

  /**
   * Capability probe result. Gates the first POST — no /decomposition request
   * is issued until `capability?.capable === true && fundId`. Env-scoped
   * first (schema + fund presence); fund-scoped second (fund exists with
   * investments) when the selected fundId is included in the probe.
   */
  const [capability, setCapability] = useState<ReV2FundDecompositionCapability | null>(null);
  const [capabilityLoading, setCapabilityLoading] = useState<boolean>(true);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fund list for the picker.
  useEffect(() => {
    let cancelled = false;
    if (!businessId) return;
    listRepeFunds(businessId)
      .then((rows) => {
        if (cancelled) return;
        setFunds(rows);
        if (!fundId && rows.length > 0) {
          setFundId(rows[0].fund_id);
        }
      })
      .catch(() => {
        if (!cancelled) setFunds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, fundId]);

  // Capability probe. Runs on mount and whenever fundId changes.
  useEffect(() => {
    let cancelled = false;
    setCapabilityLoading(true);
    getFundDecompositionCapabilities({ fundId: fundId ?? undefined })
      .then((payload) => {
        if (cancelled) return;
        setCapability(payload);
      })
      .catch(() => {
        if (cancelled) return;
        setCapability({
          capable: false,
          error_code: "CAPABILITY_PROBE_FAILED",
          reasons: ["capability probe request failed"],
          missing_migrations: [],
          missing_tables: [],
          fund_count: 0,
          fund: null,
        });
      })
      .finally(() => {
        if (!cancelled) setCapabilityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fundId]);

  // Authoritative baseline — mandatory via SINGLE FETCH LAYER.
  const { state: authState, lockState: authLock } = useAuthoritativeState({
    entityType: "fund",
    entityId: fundId ?? undefined,
    quarter,
  });
  const baselineRenderable = isLockStateRenderable(authLock);

  // Overlay fetch — debounced on selection changes.
  const fetchOverlay = useCallback(
    (fid: string, excluded: string[]) => {
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setOverlayLoading(true);
      setOverlayError(null);
      getFundDecomposition({
        fundId: fid,
        asOfQuarter: quarter,
        excludedInvestmentIds: excluded,
        signal: ctrl.signal,
      })
        .then((payload) => {
          if (ctrl.signal.aborted) return;
          setDecomp(payload);
          const failing = payload.identity_checks.some((c) => !c.passed && c.applied !== false);
          setIdentityOpen(failing);
        })
        .catch((err: FundDecompositionApiError | Error) => {
          if (ctrl.signal.aborted) return;
          const errorCode = (err as FundDecompositionApiError).errorCode ?? "OVERLAY_COMPUTATION_FAILED";
          setOverlayError({
            errorCode,
            message: err.message,
            detail: (err as FundDecompositionApiError).detail,
          });
          setDecomp(null);
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setOverlayLoading(false);
        });
    },
    [quarter],
  );

  // Gate POST on capability + fund selection. Direct API callers still get
  // typed errors from the endpoint, but the UI refuses to even try until
  // both preconditions hold.
  const shouldFetchOverlay = Boolean(
    fundId && capability?.capable && !capabilityLoading,
  );

  useEffect(() => {
    if (!shouldFetchOverlay || !fundId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchOverlay(fundId, Array.from(excludedIds));
    }, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [shouldFetchOverlay, fundId, excludedIds, fetchOverlay]);

  // Winston page context publish.
  useEffect(() => {
    if (!decomp) return;
    const topByMarginal = [...decomp.investment_contributions]
      .filter((c) => c.included && c.irr_marginal_bps != null)
      .sort((a, b) => (b.irr_marginal_bps ?? 0) - (a.irr_marginal_bps ?? 0));
    const top3 = topByMarginal.slice(0, 3);
    const bottom3 = [...topByMarginal].reverse().slice(0, 3);
    publishAssistantPageContext({
      route: `/lab/env/${params.envId}/re/fund-decomposition`,
      surface: "fund_decomposition",
      active_module: "re",
      page_entity_type: "fund",
      page_entity_id: decomp.fund_id,
      page_entity_name: funds.find((f) => f.fund_id === decomp.fund_id)?.name ?? null,
      selected_entities: [
        {
          entity_type: "fund",
          entity_id: decomp.fund_id,
          name: funds.find((f) => f.fund_id === decomp.fund_id)?.name ?? decomp.fund_id,
          source: "page",
        },
        ...decomp.investment_contributions
          .filter((c) => c.included)
          .map((c) => ({
            entity_type: "investment" as const,
            entity_id: c.investment_id,
            name: c.name,
            source: "page" as const,
          })),
      ],
      visible_data: {
        funds: [],
        investments: decomp.investment_contributions.map((c) => ({
          entity_type: "investment",
          entity_id: c.investment_id,
          name: c.name,
          parent_entity_type: "fund",
          parent_entity_id: decomp.fund_id,
          metadata: {
            included: c.included,
            paid_in: c.paid_in,
            distributions: c.distributions,
            nav: c.nav,
            gross_irr: c.gross_irr,
            irr_marginal_bps: c.irr_marginal_bps,
            irr_marginal_label: c.irr_marginal_label,
          },
        })),
        metrics: {
          overlay_semantics: decomp.selection_definition.overlay_semantics,
          as_of_quarter: decomp.as_of_quarter,
          baseline_gross_irr: decomp.baseline_authoritative.gross_irr,
          baseline_net_irr: decomp.baseline_authoritative.net_irr,
          baseline_tvpi: decomp.baseline_authoritative.tvpi,
          baseline_dpi: decomp.baseline_authoritative.dpi,
          selection_gross_irr: decomp.selection_derived.gross_irr,
          selection_tvpi: decomp.selection_derived.tvpi,
          selection_dpi: decomp.selection_derived.dpi,
          selection_paid_in: decomp.selection_derived.paid_in,
          selection_distributions: decomp.selection_derived.distributions,
          selection_nav: decomp.selection_derived.nav,
          count_investments_selected: decomp.selection_definition.included_investment_ids.length,
          count_investments_excluded: decomp.selection_definition.excluded_investment_ids.length,
        },
        notes: [
          `Overlay semantics: ${decomp.selection_definition.overlay_semantics}`,
          `Top marginal contributors (non-additive heuristic): ${top3
            .map((c) => `${c.name} (${c.irr_marginal_bps?.toFixed(0)} bps)`)
            .join(", ") || "none"}`,
          `Bottom marginal contributors (non-additive heuristic): ${bottom3
            .map((c) => `${c.name} (${c.irr_marginal_bps?.toFixed(0)} bps)`)
            .join(", ") || "none"}`,
        ],
      },
    });
    return () => {
      resetAssistantPageContext();
    };
  }, [decomp, funds, params.envId]);

  const onToggleInvestment = useCallback((investmentId: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(investmentId)) next.delete(investmentId);
      else next.add(investmentId);
      return next;
    });
  }, []);

  const onReset = useCallback(() => setExcludedIds(new Set()), []);

  const onRealizedOnly = useCallback(() => {
    if (!decomp) return;
    const nextExcluded = new Set<string>();
    for (const inv of decomp.investment_contributions) {
      const allRealized =
        inv.assets.length > 0 && inv.assets.every((a) => isRealizedStatus(a.status));
      if (!allRealized) nextExcluded.add(inv.investment_id);
    }
    setExcludedIds(nextExcluded);
  }, [decomp]);

  const onUnrealizedOnly = useCallback(() => {
    if (!decomp) return;
    const nextExcluded = new Set<string>();
    for (const inv of decomp.investment_contributions) {
      const anyRealized = inv.assets.some((a) => isRealizedStatus(a.status));
      const allUnrealized = inv.assets.length > 0 && !anyRealized;
      if (!allUnrealized) nextExcluded.add(inv.investment_id);
    }
    setExcludedIds(nextExcluded);
  }, [decomp]);

  const onTop5Marginal = useCallback(() => {
    if (!decomp) return;
    const ranked = decomp.investment_contributions
      .filter((c) => c.irr_marginal_bps != null)
      .sort((a, b) => (b.irr_marginal_bps ?? 0) - (a.irr_marginal_bps ?? 0))
      .slice(0, 5)
      .map((c) => c.investment_id);
    const keep = new Set(ranked);
    const nextExcluded = new Set<string>();
    for (const inv of decomp.investment_contributions) {
      if (!keep.has(inv.investment_id)) nextExcluded.add(inv.investment_id);
    }
    setExcludedIds(nextExcluded);
  }, [decomp]);

  const onExcludeNegativeMarginal = useCallback(() => {
    if (!decomp) return;
    const nextExcluded = new Set<string>();
    for (const inv of decomp.investment_contributions) {
      if (inv.irr_marginal_bps != null && inv.irr_marginal_bps < 0) {
        nextExcluded.add(inv.investment_id);
      }
    }
    setExcludedIds(nextExcluded);
  }, [decomp]);

  const baselineMetrics = useMemo(() => {
    if (!baselineRenderable) return null;
    const cm = (authState?.state?.canonical_metrics ?? {}) as Record<string, unknown>;
    const num = (v: unknown): number | null => {
      if (v == null) return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    };
    return {
      gross_irr: num(cm.gross_irr),
      net_irr: num(cm.net_irr),
      tvpi: num(cm.tvpi),
      dpi: num(cm.dpi),
      snapshot_version: authState?.snapshot_version ?? null,
      trust_status: authState?.trust_status ?? null,
      period_exact: authState?.period_exact ?? null,
      promotion_state: authState?.promotion_state ?? null,
    };
  }, [authState, baselineRenderable]);

  const identityAllPassing = useMemo(() => {
    if (!decomp) return true;
    return decomp.identity_checks.every((c) => c.passed || c.applied === false);
  }, [decomp]);

  const includedInvestments = useMemo(() => {
    if (!decomp) return [];
    return decomp.investment_contributions.filter((c) => c.included);
  }, [decomp]);

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <header className="border-b border-neutral-200 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">
              Fund Decomposition{" "}
              <span className="text-neutral-500 font-normal">— Gross Contribution Overlay</span>
            </h1>
            <p
              className="text-sm text-neutral-600 mt-1 max-w-3xl"
              data-testid="overlay-subtitle"
            >
              {PAGE_SUBTITLE}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-neutral-500">Fund</label>
            <select
              className="border border-neutral-300 rounded px-2 py-1 text-sm"
              value={fundId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                setFundId(id);
                setExcludedIds(new Set());
                if (id) {
                  const url = new URL(window.location.href);
                  url.searchParams.set("fund", id);
                  router.replace(url.pathname + url.search);
                }
              }}
              data-testid="fund-picker"
            >
              <option value="" disabled>
                Select fund
              </option>
              {funds.map((f) => (
                <option key={f.fund_id} value={f.fund_id}>
                  {f.name}
                </option>
              ))}
            </select>
            <span
              className="text-xs text-neutral-500 border border-neutral-200 rounded px-2 py-1"
              title="XIRR uses quarter-end dates on materialized quarterly cash flows. Transaction-dated IRRs elsewhere may differ by days of interest."
            >
              as of {quarter} (quarter-end)
            </span>
            <button
              type="button"
              className={`text-xs rounded px-2 py-1 border ${
                identityAllPassing
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-red-300 bg-red-50 text-red-800"
              }`}
              onClick={() => setIdentityOpen((v) => !v)}
              data-testid="identity-chip"
            >
              Identity checks {identityAllPassing ? "✓" : "⚠"}
            </button>
            <button
              type="button"
              className="text-xs rounded px-3 py-1 bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-40"
              disabled={!decomp}
              onClick={() => {
                // Winston explainer — context already published via useEffect.
                // Opening the command bar is handled by the global keyboard shortcut.
                window.dispatchEvent(
                  new CustomEvent("winston:open", {
                    detail: {
                      prefill:
                        "Explain this fund's performance using the current selection. Call out top and bottom marginal contributors and remember this is a gross contribution overlay, not an alternate fund history.",
                    },
                  }),
                );
              }}
              data-testid="explain-btn"
            >
              Explain fund performance
            </button>
          </div>
        </div>
      </header>

      {/* Unavailable / empty / error states.
          Gated in strict priority order so we never collapse distinct
          states into one generic banner:
            1. env_not_capable   — schema / migrations missing
            2. env_has_no_re_data — schema present but env has no funds
            3. fund_not_found    — capability says fund is missing OR overlay POST said so
            4. overlay_failed    — compute actually broke (last resort)
      */}
      {!capabilityLoading && capability?.error_code === "ENV_NOT_DECOMPOSITION_CAPABLE" && (
        <div
          className="border border-rose-300 bg-rose-50 text-rose-900 rounded p-4 text-sm"
          data-testid="state-env-not-capable"
        >
          <div className="font-semibold mb-1">
            Fund decomposition is unavailable in this environment
          </div>
          <div>
            Required RE data-model migrations and decomposition tables are not present for this workspace.
          </div>
          {capability.missing_migrations.length > 0 && (
            <div className="mt-2 text-xs text-rose-800">
              Missing migrations: {capability.missing_migrations.join(", ")}
            </div>
          )}
          {capability.missing_tables.length > 0 && (
            <div className="mt-1 text-xs text-rose-800">
              Missing tables: {capability.missing_tables.join(", ")}
            </div>
          )}
        </div>
      )}

      {!capabilityLoading && capability?.error_code === "ENV_HAS_NO_RE_DATA" && (
        <div
          className="border border-amber-300 bg-amber-50 text-amber-900 rounded p-4 text-sm"
          data-testid="state-env-has-no-re-data"
        >
          <div className="font-semibold mb-1">No RE funds in this workspace yet</div>
          <div>
            Fund decomposition has nothing to show until at least one fund is seeded into this environment.
          </div>
        </div>
      )}

      {!capabilityLoading
        && capability?.capable
        && (capability.error_code === "FUND_NOT_FOUND"
          || overlayError?.errorCode === "FUND_NOT_FOUND") && (
        <div
          className="border border-amber-300 bg-amber-50 text-amber-900 rounded p-4 text-sm"
          data-testid="state-fund-not-found"
        >
          <div className="font-semibold mb-1">Fund not found</div>
          <div>
            The selected fund is not present in this workspace, or has no investments.
          </div>
        </div>
      )}

      {/* Generic overlay failure — only shown when none of the typed states
          above apply. Never swallow a typed category into this bucket. */}
      {overlayError
        && overlayError.errorCode !== "FUND_NOT_FOUND"
        && overlayError.errorCode !== "ENV_NOT_DECOMPOSITION_CAPABLE"
        && overlayError.errorCode !== "ENV_HAS_NO_RE_DATA"
        && overlayError.errorCode !== "AT_LEAST_ONE_ASSET_REQUIRED" && (
        <div
          className="border border-rose-300 bg-rose-50 text-rose-900 rounded p-4 text-sm"
          data-testid="state-overlay-failed"
        >
          <div className="font-semibold mb-1">Decomposition failed</div>
          <div>{overlayError.message}</div>
          <div className="mt-1 text-xs text-rose-800">
            error_code: {overlayError.errorCode}
          </div>
        </div>
      )}

      {/* Identity checks drawer */}
      {identityOpen && decomp && (
        <div
          className="border border-neutral-200 rounded bg-neutral-50 p-3 text-xs"
          data-testid="identity-panel"
        >
          <div className="font-medium text-neutral-900 mb-1">Identity checks</div>
          <ul className="space-y-0.5">
            {decomp.identity_checks.map((c) => (
              <li
                key={c.name}
                className={
                  c.applied === false
                    ? "text-neutral-500"
                    : c.passed
                      ? "text-emerald-800"
                      : "text-red-800"
                }
              >
                {c.passed ? "✓" : "⚠"} {c.name}
                {c.applied === false && ` — not applied (${c.applied_reason ?? "n/a"})`}
                {c.delta !== undefined && ` — delta ${Number(c.delta).toExponential(2)}`}
                {c.delta_gross_irr_bps != null && ` — Δ IRR ${c.delta_gross_irr_bps.toFixed(2)} bps`}
                {c.delta_tvpi != null && `, Δ TVPI ${c.delta_tvpi.toFixed(4)}`}
              </li>
            ))}
          </ul>
          <div className="mt-2 text-neutral-500">
            Provenance: CF ← {decomp.provenance.cf_substrate}; Paid-in ← {decomp.provenance.paid_in_substrate};
            XIRR ← {decomp.provenance.xirr_engine}
          </div>
        </div>
      )}

      {/* Baseline strip */}
      <section
        className="border border-neutral-200 rounded p-3 bg-white"
        data-testid="baseline-strip"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
            Baseline — authoritative fund
          </div>
          {baselineMetrics && (
            <TrustChip
              lockState={authLock}
              snapshotVersion={baselineMetrics.snapshot_version ?? undefined}
              trustStatus={baselineMetrics.trust_status ?? undefined}
            />
          )}
        </div>
        <div className="grid grid-cols-4 gap-3">
          <BaselineTile label="Gross IRR" value={fmtPct(baselineMetrics?.gross_irr)} />
          <BaselineTile
            label="Net IRR"
            value={fmtPct(baselineMetrics?.net_irr)}
            greyed
            hint={NET_IRR_OVERLAY_LABEL}
          />
          <BaselineTile label="TVPI" value={fmtMultiple(baselineMetrics?.tvpi)} />
          <BaselineTile label="DPI" value={fmtMultiple(baselineMetrics?.dpi)} />
        </div>
        {!baselineRenderable && (
          <div className="text-xs text-neutral-500 mt-2">
            Authoritative baseline not renderable for this period (lockState: {authLock}).
          </div>
        )}
      </section>

      {/* Overlay strip */}
      <section
        className="border border-neutral-200 rounded p-3 bg-white"
        data-testid="overlay-strip"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
            Selection — decomposition overlay
          </div>
          <span className="text-[10px] uppercase tracking-wider text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
            overlay
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <OverlayTile
            label="Gross IRR"
            value={fmtPct(decomp?.selection_derived.gross_irr)}
            loading={overlayLoading}
            nullReason={decomp?.selection_derived.gross_irr_null_reason}
          />
          <OverlayTile
            label="TVPI"
            value={fmtMultiple(decomp?.selection_derived.tvpi)}
            loading={overlayLoading}
          />
          <OverlayTile
            label="DPI"
            value={fmtMultiple(decomp?.selection_derived.dpi)}
            loading={overlayLoading}
          />
        </div>
        <div className="text-[11px] text-neutral-500 mt-2">
          Net IRR intentionally absent from the overlay.{" "}
          <span title={NET_IRR_OVERLAY_LABEL} className="underline decoration-dotted cursor-help">
            Why?
          </span>
        </div>
      </section>

      {/* Main grid */}
      <section className="grid grid-cols-12 gap-4">
        {/* Investment selector */}
        <div className="col-span-3 border border-neutral-200 rounded p-3 bg-white">
          <div className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
            Investments
          </div>
          <div className="max-h-[420px] overflow-auto">
            {includedInvestments.length === 0 && !overlayLoading && decomp && (
              <div className="text-xs text-neutral-500 py-4">
                No investments in current selection.
              </div>
            )}
            {decomp?.investment_contributions.map((inv) => (
              <InvestmentRow
                key={inv.investment_id}
                inv={inv}
                onToggle={() => onToggleInvestment(inv.investment_id)}
              />
            ))}
          </div>
          <div className="mt-3 space-y-1">
            <div className="flex gap-1">
              <QuickBtn label="Realized only" onClick={onRealizedOnly} />
              <QuickBtn label="Unrealized only" onClick={onUnrealizedOnly} />
              <QuickBtn label="Reset" onClick={onReset} />
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer text-neutral-500">More filters</summary>
              <div className="flex gap-1 mt-1 flex-wrap">
                <QuickBtn
                  label="Top 5 (marginal heuristic)"
                  onClick={onTop5Marginal}
                  small
                />
                <QuickBtn
                  label="Exclude negative-marginal"
                  onClick={onExcludeNegativeMarginal}
                  small
                />
              </div>
            </details>
          </div>
        </div>

        {/* Cumulative CF chart */}
        <div
          className="col-span-6 border border-neutral-200 rounded p-3 bg-white"
          data-testid="cashflow-chart"
        >
          <div className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
            Cumulative cash flow (quarter-end)
          </div>
          <div className="h-[360px]">
            {decomp ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={decomp.selection_derived.cashflow_series}
                  margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis
                    dataKey="quarter"
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={(v) => fmtCompact(Number(v))}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip
                    formatter={(v: number | string) => fmtCompact(Number(v))}
                    contentStyle={{ fontSize: 11 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line
                    type="monotone"
                    dataKey="cumulative"
                    name="Selection (cumulative)"
                    stroke={CHART_COLORS.revenue}
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-neutral-400 h-full grid place-items-center">
                {overlayLoading ? "Loading…" : "No data"}
              </div>
            )}
          </div>
        </div>

        {/* Attribution bar chart */}
        <div
          className="col-span-3 border border-neutral-200 rounded p-3 bg-white"
          data-testid="attribution-chart"
        >
          <div className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">
            Marginal impact
          </div>
          <div className="text-[10px] text-neutral-500 mb-2">
            under current selection (leave-one-out, non-additive)
          </div>
          <div className="h-[360px]">
            {includedInvestments.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={includedInvestments
                    .filter((c) => c.irr_marginal_bps != null)
                    .sort((a, b) => (b.irr_marginal_bps ?? 0) - (a.irr_marginal_bps ?? 0))
                    .map((c) => ({
                      name: c.name,
                      bps: c.irr_marginal_bps,
                    }))}
                  layout="vertical"
                  margin={{ top: 5, right: 10, left: 70, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip
                    formatter={(v: number | string) => `${Number(v).toFixed(0)} bps`}
                    contentStyle={{ fontSize: 11 }}
                  />
                  <Bar dataKey="bps">
                    {includedInvestments
                      .filter((c) => c.irr_marginal_bps != null)
                      .sort((a, b) => (b.irr_marginal_bps ?? 0) - (a.irr_marginal_bps ?? 0))
                      .map((c, i) => (
                        <Cell
                          key={c.investment_id}
                          fill={(c.irr_marginal_bps ?? 0) >= 0 ? "#10b981" : "#ef4444"}
                        />
                      ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-neutral-400 h-full grid place-items-center">
                No contribution data.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Investment table */}
      <section className="border border-neutral-200 rounded bg-white">
        <div className="p-3 text-xs font-medium text-neutral-500 uppercase tracking-wide border-b">
          Investments
        </div>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="text-left px-3 py-1.5">Name</th>
                <th className="text-right px-3 py-1.5">Paid-in</th>
                <th className="text-right px-3 py-1.5">Distributions</th>
                <th className="text-right px-3 py-1.5">NAV</th>
                <th className="text-right px-3 py-1.5">Gross IRR</th>
                <th className="text-right px-3 py-1.5">Marginal bps</th>
                <th className="text-center px-3 py-1.5">Included</th>
                <th className="text-left px-3 py-1.5">Assets</th>
              </tr>
            </thead>
            <tbody>
              {decomp?.investment_contributions.map((inv) => (
                <tr key={inv.investment_id} className="border-t border-neutral-100">
                  <td className="px-3 py-1.5 text-neutral-900">{inv.name}</td>
                  <td className="text-right px-3 py-1.5">{fmtMoney(inv.paid_in)}</td>
                  <td className="text-right px-3 py-1.5">{fmtMoney(inv.distributions)}</td>
                  <td className="text-right px-3 py-1.5">{fmtMoney(inv.nav)}</td>
                  <td className="text-right px-3 py-1.5">{fmtPct(inv.gross_irr)}</td>
                  <td
                    className="text-right px-3 py-1.5 text-neutral-600"
                    title="marginal impact under current selection (leave-one-out, non-additive)"
                  >
                    {inv.irr_marginal_bps == null
                      ? "—"
                      : `${inv.irr_marginal_bps.toFixed(0)}`}
                  </td>
                  <td className="text-center px-3 py-1.5">
                    {inv.included ? "✓" : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-neutral-500">
                    {inv.assets.length === 0
                      ? "—"
                      : inv.assets
                          .map((a) => `${a.name}${a.status ? ` (${a.status})` : ""}`)
                          .join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {auditMode && decomp && (
        <section className="border border-neutral-300 rounded p-3 bg-neutral-50 text-xs">
          <div className="font-medium mb-2">Audit mode</div>
          <pre className="whitespace-pre-wrap break-words">
            {JSON.stringify(
              {
                state_origin: decomp.state_origin,
                selection_definition: decomp.selection_definition,
                identity_checks: decomp.identity_checks,
                provenance: decomp.provenance,
                baseline_authoritative: decomp.baseline_authoritative,
              },
              null,
              2,
            )}
          </pre>
        </section>
      )}
    </div>
  );
}

function BaselineTile({
  label,
  value,
  greyed,
  hint,
}: {
  label: string;
  value: string;
  greyed?: boolean;
  hint?: string;
}) {
  return (
    <div
      className={`rounded border p-2 ${greyed ? "bg-neutral-50 border-neutral-200" : "bg-white border-neutral-200"}`}
    >
      <div className={`text-[10px] uppercase tracking-wide ${greyed ? "text-neutral-400" : "text-neutral-500"}`}>
        {label}
        {greyed && hint ? (
          <span className="ml-1 cursor-help" title={hint}>
            (baseline-only)
          </span>
        ) : null}
      </div>
      <div className={`text-lg font-semibold ${greyed ? "text-neutral-400" : "text-neutral-900"}`}>
        {value}
      </div>
    </div>
  );
}

function OverlayTile({
  label,
  value,
  loading,
  nullReason,
}: {
  label: string;
  value: string;
  loading?: boolean;
  nullReason?: string | null;
}) {
  return (
    <div className="rounded border border-neutral-200 bg-white p-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
        <span className="text-[9px] uppercase tracking-wider text-amber-800 bg-amber-50 border border-amber-200 rounded px-1 py-0.5">
          overlay
        </span>
      </div>
      <div className="text-lg font-semibold text-neutral-900">
        {loading ? "…" : value}
      </div>
      {nullReason && (
        <div className="text-[10px] text-neutral-500 mt-0.5">{nullReason}</div>
      )}
    </div>
  );
}

function InvestmentRow({
  inv,
  onToggle,
}: {
  inv: ReV2FundDecompositionInvestment;
  onToggle: () => void;
}) {
  return (
    <label className="flex items-start gap-2 py-1 cursor-pointer hover:bg-neutral-50 rounded px-1">
      <input
        type="checkbox"
        checked={inv.included}
        onChange={onToggle}
        className="mt-1"
        data-testid={`toggle-${inv.investment_id}`}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-neutral-900 truncate">{inv.name}</div>
        <div className="text-[10px] text-neutral-500 flex gap-2">
          <span>IRR {fmtPct(inv.gross_irr)}</span>
          <span>NAV {fmtMoney(inv.nav)}</span>
          {inv.irr_marginal_bps != null && (
            <span title="marginal impact under current selection (leave-one-out, non-additive)">
              {inv.irr_marginal_bps.toFixed(0)} bps*
            </span>
          )}
        </div>
        {inv.assets.length > 0 && (
          <div className="text-[10px] text-neutral-400 truncate">
            {inv.assets.map((a) => a.name).join(" · ")}
          </div>
        )}
      </div>
    </label>
  );
}

function QuickBtn({
  label,
  onClick,
  small,
}: {
  label: string;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border border-neutral-300 bg-white hover:bg-neutral-50 ${
        small ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1"
      }`}
    >
      {label}
    </button>
  );
}
