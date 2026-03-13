"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { QuarterlyBarChart, TrendLineChart, WaterfallChart } from "@/components/charts";
import type { AssistantResponseBlock } from "@/lib/commandbar/types";

function downloadCsv(filename: string, columns: string[], rows: Array<Record<string, unknown>>) {
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [
    columns.map(escape).join(","),
    ...rows.map((row) => columns.map((column) => escape(row[column])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function renderMetricValue(item: Record<string, unknown>) {
  const value = item.value;
  if (value == null || value === "") return "—";
  return String(value);
}

export default function ResponseBlockRenderer({
  block,
  onConfirmAction,
}: {
  block: AssistantResponseBlock;
  onConfirmAction?: (block: Extract<AssistantResponseBlock, { type: "confirmation" }>) => void;
}) {
  if (block.type === "markdown_text") {
    return (
      <div className="whitespace-pre-wrap text-[14px] leading-7 text-bm-text">
        {block.markdown}
      </div>
    );
  }

  if (block.type === "kpi_group") {
    return (
      <section className="space-y-3 rounded-2xl border border-bm-border/60 bg-bm-surface/30 p-4">
        {block.title ? <h3 className="text-sm font-semibold text-bm-text">{block.title}</h3> : null}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {block.items.map((item, index) => (
            <div key={`${block.block_id}-${index}`} className="rounded-xl border border-bm-border/50 bg-bm-bg/60 p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">{String(item.label ?? `Metric ${index + 1}`)}</div>
              <div className="mt-2 text-xl font-semibold text-bm-text">{renderMetricValue(item)}</div>
              {item.delta ? <div className="mt-1 text-xs text-bm-muted">{String((item.delta as { value?: string }).value ?? "")}</div> : null}
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (block.type === "table") {
    return (
      <section className="space-y-3 rounded-2xl border border-bm-border/60 bg-bm-surface/30 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            {block.title ? <h3 className="text-sm font-semibold text-bm-text">{block.title}</h3> : null}
            <p className="text-xs text-bm-muted2">{block.rows.length} row{block.rows.length === 1 ? "" : "s"}</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => downloadCsv(`${block.export_name || block.block_id}.csv`, block.columns, block.rows)}
          >
            Export CSV
          </Button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-bm-border/50">
          <table className="min-w-full divide-y divide-bm-border/40 text-left text-sm">
            <thead className="bg-bm-surface/50">
              <tr>
                {block.columns.map((column) => (
                  <th key={column} className="px-3 py-2 font-medium text-bm-muted2">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/30">
              {block.rows.map((row, rowIndex) => (
                <tr key={`${block.block_id}-${rowIndex}`} className="bg-bm-bg/20">
                  {block.columns.map((column) => (
                    <td key={`${rowIndex}-${column}`} className="px-3 py-2 text-bm-text">
                      {String(row[column] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  if (block.type === "chart") {
    const data = block.data.map((row) => ({ ...row, quarter: String(row[block.x_key] ?? "") }));
    return (
      <section className="space-y-3 rounded-2xl border border-bm-border/60 bg-bm-surface/30 p-4">
        <div>
          <h3 className="text-sm font-semibold text-bm-text">{block.title}</h3>
          {block.description ? <p className="mt-1 text-xs text-bm-muted2">{block.description}</p> : null}
        </div>
        {block.chart_type === "line" ? (
          <TrendLineChart
            data={data}
            lines={block.y_keys.map((key) => ({ key, label: key }))}
            format={block.format === "percent" ? "percent" : block.format === "number" ? "number" : "dollar"}
            height={280}
          />
        ) : block.chart_type === "waterfall" ? (
          <WaterfallChart
            items={block.data.map((row) => ({
              name: String(row[block.x_key] ?? row.name ?? "Step"),
              value: Number(row[block.y_keys[0]] ?? row.value ?? 0),
              isTotal: Boolean(row.isTotal ?? row.is_total),
            }))}
            height={280}
            valuePrefix={block.format === "percent" ? "" : "$"}
          />
        ) : (
          <QuarterlyBarChart
            data={data}
            bars={block.y_keys.map((key) => ({
              key,
              label: key,
              stackId: block.chart_type === "stacked_bar" || block.stacked ? "stack" : undefined,
            }))}
            height={280}
            valuePrefix={block.format === "percent" ? "" : "$"}
          />
        )}
      </section>
    );
  }

  if (block.type === "citations") {
    return (
      <section className="space-y-3 rounded-2xl border border-bm-border/60 bg-bm-surface/30 p-4">
        <h3 className="text-sm font-semibold text-bm-text">Sources</h3>
        <div className="space-y-2">
          {block.items.map((item, index) => (
            <div key={`${block.block_id}-${index}`} className="rounded-xl border border-bm-border/40 bg-bm-bg/40 p-3">
              <div className="flex items-center gap-2">
                {item.href ? (
                  <Link href={item.href} className="text-sm font-medium text-bm-accent hover:underline">
                    {item.label}
                  </Link>
                ) : (
                  <span className="text-sm font-medium text-bm-text">{item.label}</span>
                )}
                {typeof item.score === "number" ? (
                  <span className="rounded-full border border-bm-border/50 px-2 py-0.5 text-[10px] text-bm-muted2">
                    score {item.score.toFixed(3)}
                  </span>
                ) : null}
              </div>
              {item.snippet ? <p className="mt-1 text-xs leading-5 text-bm-muted">{item.snippet}</p> : null}
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (block.type === "tool_activity") {
    return (
      <section className="space-y-3 rounded-2xl border border-bm-border/60 bg-bm-surface/30 p-4">
        <h3 className="text-sm font-semibold text-bm-text">Tool activity</h3>
        <div className="space-y-2">
          {block.items.map((item, index) => (
            <div key={`${block.block_id}-${index}`} className="flex items-start justify-between gap-3 rounded-xl border border-bm-border/40 bg-bm-bg/40 p-3">
              <div>
                <div className="text-sm font-medium text-bm-text">{item.tool_name}</div>
                <div className="mt-1 text-xs text-bm-muted">{item.summary}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">{item.status}</div>
                {item.duration_ms ? <div className="mt-1 text-[11px] text-bm-muted2">{item.duration_ms}ms</div> : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (block.type === "workflow_result") {
    return (
      <section className="space-y-3 rounded-2xl border border-bm-border/60 bg-bm-surface/30 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-bm-text">{block.title}</h3>
            <p className="mt-1 text-sm text-bm-muted">{block.summary}</p>
          </div>
          <span className="rounded-full border border-bm-border/50 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
            {block.status}
          </span>
        </div>
        {block.metrics?.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {block.metrics.map((metric, index) => (
              <div key={`${block.block_id}-${index}`} className="rounded-xl border border-bm-border/40 bg-bm-bg/40 p-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">{String(metric.label ?? `Metric ${index + 1}`)}</div>
                <div className="mt-2 text-lg font-semibold text-bm-text">{renderMetricValue(metric)}</div>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    );
  }

  if (block.type === "confirmation") {
    return (
      <section className="space-y-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4">
        <div>
          <h3 className="text-sm font-semibold text-bm-text">Confirmation required</h3>
          <p className="mt-1 text-sm text-bm-muted">{block.summary}</p>
        </div>
        {block.missing_fields?.length ? (
          <p className="text-xs text-bm-muted2">Missing fields: {block.missing_fields.join(", ")}</p>
        ) : null}
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={() => onConfirmAction?.(block)}>
            {block.confirm_label || "Confirm"}
          </Button>
          <span className="text-xs text-bm-muted2">{block.action}</span>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-red-400/40 bg-red-500/10 p-4">
      <h3 className="text-sm font-semibold text-bm-text">{block.title || "Assistant error"}</h3>
      <p className="mt-1 text-sm text-bm-muted">{block.message}</p>
    </section>
  );
}
