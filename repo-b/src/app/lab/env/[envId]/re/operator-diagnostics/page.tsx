"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import {
  getReV2OperatorDiagnostics,
  type ReV2OperatorDiagnostics,
  type ReV2OperatorDiagnosticsAsset,
} from "@/lib/bos-api";
import {
  publishAssistantPageContext,
  resetAssistantPageContext,
} from "@/lib/commandbar/appContextBridge";

import { OperatorSummaryStrip } from "./OperatorSummaryStrip";
import { OperatorFilters } from "./OperatorFilters";
import { OperatorScatter } from "./OperatorScatter";
import { OperatorRankingTable } from "./OperatorRankingTable";
import { AssetDrilldownTable } from "./AssetDrilldownTable";

function defaultQuarter(): string {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `${now.getFullYear()}Q${q}`;
}

export default function OperatorDiagnosticsPage() {
  const params = useParams<{ envId: string }>();
  const envId = params?.envId ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();

  const quarter = searchParams?.get("quarter") || defaultQuarter();
  const acuity = searchParams?.get("acuity") || undefined;
  const region = searchParams?.get("region") || undefined;
  const operator = searchParams?.get("operator") || undefined;
  const fundId = searchParams?.get("fund_id") || undefined;
  const auditMode = searchParams?.get("audit_mode") === "1";

  const [data, setData] = useState<ReV2OperatorDiagnostics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getReV2OperatorDiagnostics({ envId, quarter, fundId, acuity, region, operator })
      .then((resp) => {
        if (cancelled) return;
        setData(resp);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [envId, quarter, fundId, acuity, region, operator]);

  // Publish Winston page context so "Explain underperformance" picks it up.
  useEffect(() => {
    if (!envId) return;
    const selectedAsset =
      selectedAssetId && data
        ? data.assets.find((a) => a.asset_id === selectedAssetId) ?? null
        : null;
    publishAssistantPageContext({
      route: `/lab/env/${envId}/re/operator-diagnostics`,
      surface: "repe",
      active_module: "re",
      page_entity_type: "env",
      page_entity_id: envId,
      page_entity_name: "Operator Diagnostics",
      selected_entities: selectedAsset
        ? [
            {
              entity_type: "asset",
              entity_id: selectedAsset.asset_id,
              name: selectedAsset.name,
              source: "selection",
            },
          ]
        : [],
      visible_data: data
        ? ({
            selected_operator: operator ?? null,
            selected_asset: selectedAsset,
            summary: data.summary,
            operators_top_5: data.operators.slice(0, 5),
            peer_set_definition: data.audit.peer_set_definition,
            demo_seed_present: data.audit.demo_seed_present,
          } as unknown as Record<string, unknown>)
        : null,
    });
    return () => {
      resetAssistantPageContext();
    };
  }, [envId, data, operator, selectedAssetId]);

  const updateSearchParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams?.toString() ?? "");
      if (value) next.set(key, value);
      else next.delete(key);
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const handleSelectOperator = useCallback(
    (opName: string | null) => {
      updateSearchParam("operator", opName);
      setSelectedAssetId(null);
    },
    [updateSearchParam],
  );

  const handleSelectAsset = useCallback((assetId: string | null) => {
    setSelectedAssetId(assetId);
  }, []);

  const displayedAssets: ReV2OperatorDiagnosticsAsset[] = useMemo(() => {
    if (!data) return [];
    if (!selectedAssetId) return data.assets;
    return data.assets.filter((a) => a.asset_id === selectedAssetId);
  }, [data, selectedAssetId]);

  return (
    <div className="flex min-h-screen flex-col bg-bm-surface/10">
      <header className="border-b border-bm-border/40 px-8 py-5">
        <div className="flex items-baseline justify-between gap-6">
          <div>
            <div className="nv-eyebrow text-bm-foreground-muted">
              REPE · Analytics
            </div>
            <h1 className="nv-h1 mt-1 text-bm-foreground">
              Operator Diagnostics
            </h1>
            <p className="mt-1 text-sm text-bm-foreground-muted">
              Senior housing — operator vs market performance, released quarter only.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-bm-foreground-muted">
              Quarter
              <input
                className="ml-2 w-24 rounded border border-bm-border bg-transparent px-2 py-1 text-sm text-bm-foreground"
                value={quarter}
                onChange={(e) => updateSearchParam("quarter", e.target.value || null)}
                placeholder="2026Q2"
              />
            </label>
            <button
              type="button"
              onClick={() => updateSearchParam("audit_mode", auditMode ? null : "1")}
              className={`rounded border px-2 py-1 text-xs ${
                auditMode
                  ? "border-amber-500 bg-amber-500/10 text-amber-300"
                  : "border-bm-border text-bm-foreground-muted hover:text-bm-foreground"
              }`}
              data-testid="audit-toggle"
            >
              {auditMode ? "Audit on" : "Audit"}
            </button>
          </div>
        </div>
      </header>

      {data?.audit.demo_seed_present && (
        <div
          data-testid="seed-banner"
          className="border-b border-amber-500/40 bg-amber-500/10 px-8 py-2 text-xs text-amber-200"
        >
          Contains seeded operator / labor values — not live operating truth. Source tags are
          visible per cell; the audit drawer itemizes seed counts.
        </div>
      )}

      <div className="px-8 pt-4">
        <OperatorFilters
          data={data}
          selected={{ acuity, region, operator, fundId }}
          onChange={(key, value) => {
            if (key === "fundId") updateSearchParam("fund_id", value);
            else updateSearchParam(key, value);
            setSelectedAssetId(null);
          }}
        />
      </div>

      <main className="flex-1 px-8 pb-10 pt-3">
        {loading && (
          <div className="py-12 text-center text-sm text-bm-foreground-muted">
            Loading operator diagnostics…
          </div>
        )}
        {error && (
          <div
            data-testid="error"
            className="my-4 rounded border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200"
          >
            {error}
          </div>
        )}
        {data && !loading && (
          <>
            <OperatorSummaryStrip summary={data.summary} />

            <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <OperatorScatter
                  assets={data.assets}
                  onSelectAsset={handleSelectAsset}
                  selectedAssetId={selectedAssetId}
                />
              </div>
              <div className="lg:col-span-1">
                <OperatorRankingTable
                  operators={data.operators}
                  selectedOperator={operator ?? null}
                  onSelectOperator={handleSelectOperator}
                  onExplain={() => {
                    // Winston companion reads __APP_CONTEXT__ via the bridge; dispatch the
                    // open event the companion listens for.
                    if (typeof window !== "undefined") {
                      window.dispatchEvent(
                        new CustomEvent("bm:winston-companion-open", {
                          detail: { source: "operator-diagnostics" },
                        }),
                      );
                    }
                  }}
                />
              </div>
            </section>

            <section className="mt-6">
              <AssetDrilldownTable
                assets={displayedAssets}
                selectedAssetId={selectedAssetId}
                onSelectAsset={handleSelectAsset}
              />
            </section>

            {auditMode && (
              <section
                data-testid="audit-drawer"
                className="mt-8 rounded-lg border border-bm-border bg-bm-surface/20 p-4 text-xs"
              >
                <header className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold text-bm-foreground">Audit Drawer</h3>
                  <span className="font-mono text-[10px] text-bm-foreground-muted">
                    audit_mode=1
                  </span>
                </header>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                  <AuditField
                    label="requested_quarter"
                    value={data.audit.requested_quarter}
                  />
                  <AuditField label="quarter" value={data.audit.quarter} />
                  <AuditField
                    label="released_count"
                    value={String(data.audit.released_count)}
                  />
                  <AuditField
                    label="missing_count"
                    value={String(data.audit.missing_count)}
                  />
                  <AuditField
                    label="demo_seed_present"
                    value={String(data.audit.demo_seed_present)}
                  />
                  <AuditField
                    label="snapshot_versions"
                    value={data.audit.snapshot_versions.join(", ") || "—"}
                    mono
                  />
                </dl>
                <details className="mt-3 rounded border border-bm-border/60 bg-bm-surface/10 p-2">
                  <summary className="cursor-pointer text-[11px] font-semibold text-bm-foreground">
                    peer_set_definition
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap font-mono text-[10px] text-bm-foreground-muted">
                    {JSON.stringify(data.audit.peer_set_definition, null, 2)}
                  </pre>
                </details>
                <details className="mt-2 rounded border border-bm-border/60 bg-bm-surface/10 p-2">
                  <summary className="cursor-pointer text-[11px] font-semibold text-bm-foreground">
                    peer_count_histogram
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap font-mono text-[10px] text-bm-foreground-muted">
                    {JSON.stringify(data.audit.peer_count_histogram, null, 2)}
                  </pre>
                </details>
                <details className="mt-2 rounded border border-bm-border/60 bg-bm-surface/10 p-2">
                  <summary className="cursor-pointer text-[11px] font-semibold text-bm-foreground">
                    metric_suppression_reasons
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap font-mono text-[10px] text-bm-foreground-muted">
                    {JSON.stringify(data.audit.metric_suppression_reasons, null, 2)}
                  </pre>
                </details>
                <details className="mt-2 rounded border border-bm-border/60 bg-bm-surface/10 p-2">
                  <summary className="cursor-pointer text-[11px] font-semibold text-bm-foreground">
                    source_provenance_counts
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap font-mono text-[10px] text-bm-foreground-muted">
                    {JSON.stringify(data.audit.source_provenance_counts, null, 2)}
                  </pre>
                </details>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function AuditField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-widest text-bm-foreground-muted">
        {label}
      </dt>
      <dd
        className={`text-xs text-bm-foreground ${
          mono ? "font-mono break-all" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
