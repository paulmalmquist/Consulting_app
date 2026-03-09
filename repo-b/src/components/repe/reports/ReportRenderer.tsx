"use client";

import React, { useEffect, useState } from "react";
import StatementTable from "@/components/repe/statements/StatementTable";

/* --------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------- */
interface BlockConfig {
  type: string;
  config: Record<string, unknown>;
}

interface ReportTemplate {
  report_key: string;
  name: string;
  description: string;
  entity_level: string;
  blocks: BlockConfig[];
}

interface Props {
  reportKey: string;
  entityType: "asset" | "investment" | "fund";
  entityId: string;
  envId: string;
  businessId: string;
  quarter: string;
  availablePeriods?: string[];
}

/* --------------------------------------------------------------------------
 * Block Components
 * -------------------------------------------------------------------------- */

function KpiStripBlock({
  metrics,
  entityId,
  entityType,
  envId,
  businessId,
  quarter,
}: {
  metrics: string[];
  entityId: string;
  entityType: string;
  envId: string;
  businessId: string;
  quarter: string;
}) {
  const [data, setData] = useState<Record<string, number>>({});

  useEffect(() => {
    const path =
      entityType === "asset"
        ? `/api/re/v2/assets/${entityId}/statements`
        : `/api/re/v2/investments/${entityId}/statements`;
    const params = new URLSearchParams({
      statement: "KPI",
      period_type: "quarterly",
      period: quarter,
      scenario: "actual",
      comparison: "none",
      env_id: envId,
      business_id: businessId,
    });
    fetch(`${path}?${params}`)
      .then((r) => r.json())
      .then((json) => {
        const map: Record<string, number> = {};
        for (const line of json.lines || []) {
          map[line.line_code] = line.amount;
        }
        setData(map);
      })
      .catch(() => {});
  }, [entityId, entityType, envId, businessId, quarter]);

  const fmtKpi = (code: string, value: number | undefined) => {
    if (value === undefined) return "—";
    if (code.includes("MARGIN") || code.includes("LTV") || code === "OCCUPANCY")
      return `${(value * 100).toFixed(1)}%`;
    if (code.includes("DSCR")) return `${value.toFixed(2)}x`;
    if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {metrics.map((m) => (
        <div
          key={m}
          className="rounded-xl border border-bm-border/50 bg-bm-surface/20 p-4 text-center"
        >
          <p className="text-xs text-bm-muted2 uppercase tracking-wider mb-1">
            {m.replace(/_/g, " ").replace("KPI", "").trim()}
          </p>
          <p className="text-xl font-semibold">{fmtKpi(m, data[m])}</p>
        </div>
      ))}
    </div>
  );
}

function StatementBlock({
  statement,
  title,
  entityType,
  entityId,
  envId,
  businessId,
  quarter,
  availablePeriods,
}: {
  statement: string;
  title: string;
  entityType: "asset" | "investment";
  entityId: string;
  envId: string;
  businessId: string;
  quarter: string;
  availablePeriods?: string[];
}) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
        {title}
      </h3>
      <StatementTable
        entityType={entityType}
        entityId={entityId}
        envId={envId}
        businessId={businessId}
        initialQuarter={quarter}
        availablePeriods={availablePeriods}
      />
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Main Renderer
 * -------------------------------------------------------------------------- */
export default function ReportRenderer({
  reportKey,
  entityType,
  entityId,
  envId,
  businessId,
  quarter,
  availablePeriods,
}: Props) {
  const [template, setTemplate] = useState<ReportTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/re/v2/reports/catalog?report_key=${reportKey}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setTemplate(data);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [reportKey]);

  if (loading) {
    return <div className="py-8 text-center text-sm text-bm-muted2">Loading report...</div>;
  }

  if (error || !template) {
    return <div className="py-4 text-sm text-red-400">{error || "Report not found"}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Report header */}
      <div className="border-b border-bm-border/50 pb-4 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">{template.name}</h2>
          <p className="text-xs text-bm-muted2 mt-1">{template.description}</p>
          <p className="text-xs text-bm-muted2 mt-0.5">
            Period: {quarter} &middot; Entity: {entityId.slice(0, 8)}...
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <a
            href={`/api/re/v2/reports/export?report_key=${reportKey}&entity_type=${entityType}&entity_id=${entityId}&quarter=${quarter}&env_id=${envId}&business_id=${businessId}&format=csv`}
            download
            className="rounded-lg border border-bm-border/50 px-3 py-1.5 text-xs font-medium text-bm-muted2 hover:bg-bm-surface/30 hover:text-bm-text transition-colors"
          >
            CSV
          </a>
          <a
            href={`/api/re/v2/reports/export?report_key=${reportKey}&entity_type=${entityType}&entity_id=${entityId}&quarter=${quarter}&env_id=${envId}&business_id=${businessId}&format=json`}
            download
            className="rounded-lg border border-bm-border/50 px-3 py-1.5 text-xs font-medium text-bm-muted2 hover:bg-bm-surface/30 hover:text-bm-text transition-colors"
          >
            JSON
          </a>
        </div>
      </div>

      {/* Render blocks */}
      {template.blocks.map((block, idx) => {
        const key = `${block.type}-${idx}`;

        switch (block.type) {
          case "kpi_strip":
            return (
              <KpiStripBlock
                key={key}
                metrics={(block.config.metrics as string[]) || []}
                entityId={entityId}
                entityType={entityType}
                envId={envId}
                businessId={businessId}
                quarter={quarter}
              />
            );

          case "statement_table":
            return (
              <StatementBlock
                key={key}
                statement={(block.config.statement as string) || "IS"}
                title={(block.config.title as string) || "Financial Statement"}
                entityType={entityType as "asset" | "investment"}
                entityId={entityId}
                envId={envId}
                businessId={businessId}
                quarter={quarter}
                availablePeriods={availablePeriods}
              />
            );

          case "waterfall_chart":
          case "trend_chart":
          case "variance_table":
          case "asset_contribution_table":
            // These blocks will render when the chart/table data APIs are available
            return (
              <div key={key} className="rounded-xl border border-bm-border/30 bg-bm-surface/10 p-6 text-center text-sm text-bm-muted2">
                {(block.config.title as string) || block.type.replace(/_/g, " ")}
                <br />
                <span className="text-xs">(Visualization block)</span>
              </div>
            );

          default:
            return null;
        }
      })}

      {/* Footer */}
      <div className="border-t border-bm-border/30 pt-3 text-xs text-bm-muted2 text-center">
        Generated from canonical financial data &middot; {new Date().toLocaleDateString()}
      </div>
    </div>
  );
}
