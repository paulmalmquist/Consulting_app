"use client";

import { useMemo, useState } from "react";

import type { ReV2OperatorDiagnosticsAsset } from "@/lib/bos-api";

interface Props {
  assets: ReV2OperatorDiagnosticsAsset[];
  selectedAssetId: string | null;
  onSelectAsset: (assetId: string | null) => void;
}

type SortKey =
  | "name"
  | "operator_name"
  | "acuity_type"
  | "occupancy"
  | "noi_margin"
  | "labor_intensity"
  | "revenue"
  | "peer_margin_delta";

function pct(value: string | null): string {
  if (value === null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function signedPct(value: string | null): string {
  if (value === null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}%`;
}

function money(value: string | null): string {
  if (value === null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function trend(value: string | null): { label: string; tone: string } {
  if (value === null) return { label: "—", tone: "text-bm-foreground-muted" };
  const n = Number(value);
  if (!Number.isFinite(n)) return { label: "—", tone: "text-bm-foreground-muted" };
  if (n > 0.005) return { label: `▲ ${(n * 100).toFixed(1)}pp`, tone: "text-emerald-300" };
  if (n < -0.005) return { label: `▼ ${(n * 100).toFixed(1)}pp`, tone: "text-amber-300" };
  return { label: "flat", tone: "text-bm-foreground-muted" };
}

export function AssetDrilldownTable({ assets, selectedAssetId, onSelectAsset }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("noi_margin");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const copy = [...assets];
    copy.sort((a, b) => {
      const va = a[sortKey] as string | null | undefined;
      const vb = b[sortKey] as string | null | undefined;
      // Nulls last
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      const na = Number(va);
      const nb = Number(vb);
      if (Number.isFinite(na) && Number.isFinite(nb)) {
        return sortDir === "asc" ? na - nb : nb - na;
      }
      const sa = String(va);
      const sb = String(vb);
      return sortDir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
    return copy;
  }, [assets, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div
      data-testid="asset-drilldown"
      className="rounded-lg border border-bm-border/40 bg-bm-surface/10"
    >
      <div className="flex items-center justify-between border-b border-bm-border/40 px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold text-bm-foreground">Asset drilldown</h2>
          <p className="text-[10px] text-bm-foreground-muted">
            {assets.length} asset{assets.length === 1 ? "" : "s"} · click a row to focus
          </p>
        </div>
        {selectedAssetId && (
          <button
            type="button"
            onClick={() => onSelectAsset(null)}
            className="text-xs text-bm-accent hover:underline"
          >
            Clear selection
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-xs tabular-nums">
          <thead className="text-[10px] uppercase tracking-wider text-bm-foreground-muted">
            <tr>
              <Th onClick={() => toggleSort("name")} active={sortKey === "name"} dir={sortDir}>
                Asset
              </Th>
              <Th
                onClick={() => toggleSort("operator_name")}
                active={sortKey === "operator_name"}
                dir={sortDir}
              >
                Operator
              </Th>
              <Th
                onClick={() => toggleSort("acuity_type")}
                active={sortKey === "acuity_type"}
                dir={sortDir}
              >
                Acuity
              </Th>
              <Th
                align="right"
                onClick={() => toggleSort("occupancy")}
                active={sortKey === "occupancy"}
                dir={sortDir}
              >
                Occupancy
              </Th>
              <Th
                align="right"
                onClick={() => toggleSort("noi_margin")}
                active={sortKey === "noi_margin"}
                dir={sortDir}
              >
                NOI margin
              </Th>
              <Th
                align="right"
                onClick={() => toggleSort("labor_intensity")}
                active={sortKey === "labor_intensity"}
                dir={sortDir}
              >
                Labor int.
              </Th>
              <Th
                align="right"
                onClick={() => toggleSort("revenue")}
                active={sortKey === "revenue"}
                dir={sortDir}
              >
                Revenue
              </Th>
              <Th
                align="right"
                onClick={() => toggleSort("peer_margin_delta")}
                active={sortKey === "peer_margin_delta"}
                dir={sortDir}
              >
                Peer Δ
              </Th>
              <th className="px-2 py-2 text-right">Trend</th>
              <th className="px-2 py-2 text-right">Origin</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-bm-foreground-muted">
                  No assets match the current selection.
                </td>
              </tr>
            )}
            {sorted.map((a) => {
              const isSelected = a.asset_id === selectedAssetId;
              const t = trend(a.occupancy_trend_qoq);
              const deltaN =
                a.peer_margin_delta !== null ? Number(a.peer_margin_delta) : null;
              const deltaTone =
                deltaN !== null && deltaN < 0 ? "text-amber-300" : "text-bm-foreground";
              const originTone =
                a.state_origin === "authoritative"
                  ? "text-emerald-300"
                  : a.state_origin === "fallback"
                  ? "text-amber-300"
                  : "text-bm-foreground-muted";
              return (
                <tr
                  key={a.asset_id}
                  onClick={() => onSelectAsset(isSelected ? null : a.asset_id)}
                  className={`cursor-pointer border-t border-bm-border/20 hover:bg-bm-surface/30 ${
                    isSelected ? "bg-bm-accent/10" : ""
                  }`}
                >
                  <td className="px-3 py-2 text-bm-foreground">{a.name}</td>
                  <td className="px-2 py-2 text-bm-foreground-muted">
                    {a.operator_name ?? "—"}
                    {a.sources.operator_name_source === "seed" && (
                      <span
                        className="ml-1 rounded bg-amber-500/20 px-1 text-[9px] font-semibold uppercase text-amber-300"
                        title="Seeded operator assignment — not live operating truth"
                      >
                        seed
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-bm-foreground-muted">
                    {a.acuity_type ?? "—"}
                  </td>
                  <MetricCell
                    value={pct(a.occupancy)}
                    reason={a.null_reasons.occupancy}
                  />
                  <MetricCell
                    value={pct(a.noi_margin)}
                    reason={a.null_reasons.noi_margin}
                  />
                  <MetricCell
                    value={pct(a.labor_intensity)}
                    reason={a.null_reasons.labor_intensity}
                  />
                  <MetricCell value={money(a.revenue)} reason={a.null_reasons.revenue} />
                  <td className={`px-2 py-2 text-right ${deltaTone}`}>
                    {a.peer_margin_delta === null ? (
                      <span className="text-bm-foreground-muted">
                        <span className="mr-0.5">—</span>
                        {a.null_reasons.peer_margin_delta && (
                          <span className="text-[9px] italic">
                            ({a.null_reasons.peer_margin_delta})
                          </span>
                        )}
                      </span>
                    ) : (
                      signedPct(a.peer_margin_delta)
                    )}
                  </td>
                  <td className={`px-2 py-2 text-right ${t.tone}`}>{t.label}</td>
                  <td className={`px-2 py-2 text-right text-[10px] uppercase ${originTone}`}>
                    {a.state_origin}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
  align,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
  align?: "right";
}) {
  return (
    <th
      className={`cursor-pointer px-2 py-2 ${align === "right" ? "text-right" : "text-left"}`}
      onClick={onClick}
    >
      <span className={active ? "text-bm-foreground" : ""}>{children}</span>
      {active && <span className="ml-1">{dir === "asc" ? "▲" : "▼"}</span>}
    </th>
  );
}

function MetricCell({ value, reason }: { value: string; reason: string | undefined }) {
  if (value !== "—") {
    return <td className="px-2 py-2 text-right text-bm-foreground">{value}</td>;
  }
  return (
    <td className="px-2 py-2 text-right text-bm-foreground-muted">
      <span>—</span>
      {reason && (
        <span className="ml-1 text-[9px] italic">({reason})</span>
      )}
    </td>
  );
}
