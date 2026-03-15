"use client";

import React from "react";
import { Button } from "@/components/ui/Button";
import type {
  StructuredResult,
  StructuredResultAction,
  StructuredResultHeatmap,
  StructuredResultMetric,
  StructuredResultPrimitive,
  StructuredResultSection,
  StructuredResultTable,
  WaterfallRunSummary,
} from "@/lib/commandbar/store";

function formatCellValue(value: StructuredResultPrimitive): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function labelize(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function MetricRow({ metric }: { metric: StructuredResultMetric }) {
  return (
    <div className="flex items-center justify-between border-b border-bm-border/20 py-1.5 last:border-0">
      <span className="text-xs text-bm-muted">{metric.label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium text-bm-text">{metric.value ?? "—"}</span>
        {metric.delta ? (
          <span
            className={`rounded px-1.5 py-0.5 text-xs font-medium ${
              metric.delta.direction === "positive"
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-red-500/15 text-red-400"
            }`}
          >
            {metric.delta.value}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ParameterSection({ parameters }: { parameters: Record<string, string | null> }) {
  const entries = Object.entries(parameters).filter(([, value]) => value != null);
  if (!entries.length) return null;

  return (
    <div className="mt-2 border-t border-bm-border/30 pt-2">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-baseline gap-1">
            <span className="text-[10px] uppercase tracking-wider text-bm-muted2">{key}</span>
            <span className="text-xs text-bm-text">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GenericTable({
  title,
  table,
  numericColumns,
}: {
  title?: string;
  table: StructuredResultTable;
  numericColumns?: string[];
}) {
  if (!table.rows.length || !table.columns.length) return null;
  const numeric = new Set(numericColumns || []);

  const handleExportCsv = () => {
    const header = table.columns.join(",");
    const rows = table.rows.map((r) =>
      table.columns
        .map((c) => {
          const val = String(r[c] ?? "");
          return val.includes(",") || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
        })
        .join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(title || "export").replace(/\s+/g, "_").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-2 overflow-x-auto">
      <div className="flex items-center justify-between mb-1">
        {title ? <div className="text-[11px] font-medium text-bm-muted">{title}</div> : <div />}
        <button
          type="button"
          onClick={handleExportCsv}
          className="text-[10px] text-bm-muted2 hover:text-bm-accent transition-colors"
          title="Export as CSV"
        >
          Export CSV
        </button>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-bm-border/30">
            {table.columns.map((column) => (
              <th
                key={column}
                className={`px-1.5 py-1 text-[10px] font-medium uppercase tracking-wider text-bm-muted2 ${
                  numeric.has(column) ? "text-right" : "text-left"
                }`}
              >
                {labelize(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, index) => (
            <tr key={index} className="border-b border-bm-border/10">
              {table.columns.map((column) => (
                <td
                  key={column}
                  className={`px-1.5 py-1 text-bm-text ${numeric.has(column) ? "text-right" : ""}`}
                >
                  {formatCellValue(row[column] ?? null)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PartnerTable({ partners }: { partners: Array<Record<string, string | null>> }) {
  if (!partners.length) return null;
  return (
    <GenericTable
      title="Partners"
      table={{
        columns: ["name", "type", "committed", "contributed", "distributed", "nav_share", "tvpi", "dpi"],
        rows: partners,
      }}
      numericColumns={["committed", "contributed", "distributed", "nav_share", "tvpi", "dpi"]}
    />
  );
}

function AssetTable({ assets }: { assets: Array<Record<string, string | null>> }) {
  if (!assets.length) return null;
  return (
    <GenericTable
      title="Assets"
      table={{
        columns: ["name", "base", "stressed", "impact"],
        rows: assets,
      }}
      numericColumns={["base", "stressed", "impact"]}
    />
  );
}

function ScenarioTable({ scenarios }: { scenarios: Array<Record<string, string | null>> }) {
  if (!scenarios.length) return null;
  const columns = Array.from(
    scenarios.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()),
  );
  return (
    <GenericTable
      title="Scenarios"
      table={{ columns, rows: scenarios }}
      numericColumns={["gross_irr", "net_irr", "tvpi", "dpi", "nav"]}
    />
  );
}

function TierTable({ tiers }: { tiers: Array<Record<string, string>> }) {
  if (!tiers.length) return null;
  return (
    <GenericTable
      title="Tier Allocations"
      table={{
        columns: ["tier", "participant", "payout_type", "amount"],
        rows: tiers,
      }}
      numericColumns={["amount"]}
    />
  );
}

function HeatmapBlock({ heatmap }: { heatmap: StructuredResultHeatmap }) {
  if (!heatmap.rows.length) return null;
  const numericValues = heatmap.rows
    .flat()
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  const min = numericValues.length ? Math.min(...numericValues) : 0;
  const max = numericValues.length ? Math.max(...numericValues) : 0;

  const cellTone = (value: StructuredResultPrimitive) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "bg-bm-bg/40 text-bm-text";
    if (max === min) return "bg-bm-accent/10 text-bm-text";
    const ratio = (numeric - min) / (max - min);
    if (ratio >= 0.75) return "bg-emerald-500/20 text-emerald-300";
    if (ratio >= 0.5) return "bg-emerald-500/10 text-bm-text";
    if (ratio >= 0.25) return "bg-amber-500/10 text-bm-text";
    return "bg-red-500/15 text-red-300";
  };

  return (
    <div className="mt-2 overflow-x-auto">
      {heatmap.title ? <div className="mb-1 text-[11px] font-medium text-bm-muted">{heatmap.title}</div> : null}
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-bm-border/30">
            <th className="px-1.5 py-1 text-left text-[10px] font-medium uppercase tracking-wider text-bm-muted2">
              NOI Stress
            </th>
            {heatmap.col_headers.map((header) => (
              <th
                key={header}
                className="px-1.5 py-1 text-right text-[10px] font-medium uppercase tracking-wider text-bm-muted2"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {heatmap.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-bm-border/10">
              <td className="px-1.5 py-1 text-bm-text">{heatmap.row_headers[rowIndex] ?? `Row ${rowIndex + 1}`}</td>
              {row.map((value, colIndex) => {
                const isBase = heatmap.base_value != null && String(value) === String(heatmap.base_value);
                return (
                  <td key={`${rowIndex}-${colIndex}`} className="px-1.5 py-1 text-right">
                    <span
                      className={`inline-flex min-w-[56px] items-center justify-end rounded px-1.5 py-0.5 ${
                        isBase ? "ring-1 ring-bm-accent/60" : ""
                      } ${cellTone(value)}`}
                    >
                      {formatCellValue(value)}
                      {heatmap.value_suffix || ""}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionBlock({ sections }: { sections: StructuredResultSection[] }) {
  if (!sections.length) return null;
  const fullText = sections
    .map((section) => `${section.title}\n\n${section.content}`.trim())
    .join("\n\n");

  const handleCopy = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(fullText);
  };

  const handleExport = async () => {
    const { Document, HeadingLevel, Packer, Paragraph, TextRun } = await import("docx");
    const doc = new Document({
      sections: [
        {
          children: sections.flatMap((section) => {
            const paragraphs = section.content
              .split(/\n{2,}/)
              .map((paragraph) => paragraph.trim())
              .filter(Boolean)
              .map((paragraph) => new Paragraph({ children: [new TextRun(paragraph)] }));
            return [
              new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1 }),
              ...paragraphs,
            ];
          }),
        },
      ],
    });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "waterfall-memo.docx";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-2 space-y-2">
      <div className="flex justify-end gap-1.5">
        <Button type="button" size="sm" variant="secondary" className="h-6 rounded-full text-[11px]" onClick={() => void handleCopy()}>
          Copy to Clipboard
        </Button>
        <Button type="button" size="sm" variant="secondary" className="h-6 rounded-full text-[11px]" onClick={() => void handleExport()}>
          Export .docx
        </Button>
      </div>
      {sections.map((section) => (
        <div key={section.title} className="rounded-md border border-bm-border/20 bg-bm-bg/25 p-2.5">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-bm-muted2">
            {section.title}
          </div>
          <div className="whitespace-pre-wrap text-xs leading-relaxed text-bm-text/90">
            {section.content}
          </div>
        </div>
      ))}
    </div>
  );
}

function SessionRunsTable({ runs }: { runs: WaterfallRunSummary[] }) {
  if (!runs.length) return null;
  return (
    <GenericTable
      title="Tracked Waterfall Runs"
      table={{
        columns: ["scenario_name", "quarter", "irr", "nav", "carry"],
        rows: runs.map((run) => ({
          scenario_name: run.scenario_name || run.run_id,
          quarter: run.quarter || null,
          irr: (run.key_metrics?.irr as StructuredResultPrimitive) ?? null,
          nav: (run.key_metrics?.nav as StructuredResultPrimitive) ?? null,
          carry: (run.key_metrics?.carry as StructuredResultPrimitive) ?? null,
        })),
      }}
      numericColumns={["irr", "nav", "carry"]}
    />
  );
}

function ActionBar({
  actions,
  onAction,
}: {
  actions: StructuredResultAction[];
  onAction: (action: StructuredResultAction) => void;
}) {
  if (!actions.length) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-bm-border/30 pt-2">
      {actions.map((action) => (
        <Button
          key={`${action.action}-${action.label}`}
          type="button"
          size="sm"
          variant="secondary"
          className="h-6 rounded-full text-[11px]"
          onClick={() => onAction(action)}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}

export default function StructuredResultCard({
  result,
  onAction,
}: {
  result: StructuredResult;
  onAction?: (action: StructuredResultAction) => void;
}) {
  const card = result.card;
  const handleAction = onAction ?? (() => {});

  return (
    <div className="animate-winston-fade-in rounded-lg border border-bm-accent/20 bg-bm-surface/40 p-3">
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-bm-text">{card.title}</h3>
        {card.subtitle ? <p className="text-[11px] text-bm-muted">{card.subtitle}</p> : null}
      </div>

      {card.metrics && card.metrics.length > 0 ? (
        <div className="rounded-md border border-bm-border/20 bg-bm-bg/30 px-2.5 py-1">
          {card.metrics.map((metric, index) => (
            <MetricRow key={index} metric={metric} />
          ))}
        </div>
      ) : null}

      {card.table ? <GenericTable table={card.table} /> : null}
      {card.heatmap ? <HeatmapBlock heatmap={card.heatmap} /> : null}
      {card.sections ? <SectionBlock sections={card.sections} /> : null}
      {card.session_waterfall_runs ? <SessionRunsTable runs={card.session_waterfall_runs} /> : null}
      {card.tiers ? <TierTable tiers={card.tiers} /> : null}
      {card.partners ? <PartnerTable partners={card.partners} /> : null}
      {card.assets ? <AssetTable assets={card.assets} /> : null}
      {card.scenarios ? <ScenarioTable scenarios={card.scenarios} /> : null}
      {card.parameters ? <ParameterSection parameters={card.parameters} /> : null}
      {card.actions ? <ActionBar actions={card.actions} onAction={handleAction} /> : null}
    </div>
  );
}
