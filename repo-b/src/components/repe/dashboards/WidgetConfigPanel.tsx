"use client";

import { useCallback, useState } from "react";
import type { DashboardWidget, WidgetType, ChartFormat } from "@/lib/dashboards/types";
import { METRIC_CATALOG } from "@/lib/dashboards/metric-catalog";

/* --------------------------------------------------------------------------
 * Props
 * -------------------------------------------------------------------------- */
interface Props {
  widget: DashboardWidget;
  onUpdate: (updated: DashboardWidget) => void;
  onRemove: () => void;
  onClose: () => void;
}

const WIDGET_TYPE_OPTIONS: Array<{ value: WidgetType; label: string }> = [
  { value: "metric_card", label: "Metric Card" },
  { value: "metrics_strip", label: "Metrics Strip" },
  { value: "trend_line", label: "Trend Line" },
  { value: "bar_chart", label: "Bar Chart" },
  { value: "waterfall", label: "Waterfall" },
  { value: "statement_table", label: "Statement Table" },
  { value: "comparison_table", label: "Comparison Table" },
  { value: "text_block", label: "Text Block" },
];

const PERIOD_OPTIONS = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
  { value: "ytd", label: "YTD" },
  { value: "ttm", label: "TTM" },
];

const SCENARIO_OPTIONS = [
  { value: "actual", label: "Actual" },
  { value: "budget", label: "Budget" },
  { value: "proforma", label: "Pro Forma" },
];

const COMPARISON_OPTIONS = [
  { value: "none", label: "None" },
  { value: "budget", label: "vs Budget" },
  { value: "prior_year", label: "vs Prior Year" },
];

const FORMAT_OPTIONS: Array<{ value: ChartFormat; label: string }> = [
  { value: "dollar", label: "Dollar" },
  { value: "percent", label: "Percent" },
  { value: "number", label: "Number" },
  { value: "ratio", label: "Ratio" },
];

const SIZE_PRESETS = [
  { label: "Full", w: 12, h: 4 },
  { label: "Half", w: 6, h: 4 },
  { label: "Third", w: 4, h: 4 },
  { label: "Quarter", w: 3, h: 3 },
  { label: "Banner", w: 12, h: 2 },
];

/* --------------------------------------------------------------------------
 * Component
 * -------------------------------------------------------------------------- */
export default function WidgetConfigPanel({ widget, onUpdate, onRemove, onClose }: Props) {
  const [title, setTitle] = useState(widget.config.title || "");
  const [type, setType] = useState(widget.type);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(
    (widget.config.metrics || []).map((m) => m.key),
  );
  const [statement, setStatement] = useState(widget.config.statement || "IS");
  const [periodType, setPeriodType] = useState(widget.config.period_type || "quarterly");
  const [scenario, setScenario] = useState(widget.config.scenario || "actual");
  const [comparison, setComparison] = useState(widget.config.comparison || "none");
  const [format, setFormat] = useState(widget.config.format || "dollar");
  const [layoutW, setLayoutW] = useState(widget.layout.w);
  const [layoutH, setLayoutH] = useState(widget.layout.h);

  const handleSave = useCallback(() => {
    onUpdate({
      ...widget,
      type,
      config: {
        ...widget.config,
        title: title || undefined,
        metrics: selectedMetrics.map((k) => ({ key: k })),
        statement: statement as "IS" | "CF" | "BS" | "KPI",
        period_type: periodType as "monthly" | "quarterly" | "annual" | "ytd" | "ttm",
        scenario: scenario as "actual" | "budget" | "proforma",
        comparison: comparison as "none" | "budget" | "prior_year",
        format: format as ChartFormat,
      },
      layout: { ...widget.layout, w: layoutW, h: layoutH },
    });
    onClose();
  }, [widget, type, title, selectedMetrics, statement, periodType, scenario, comparison, format, layoutW, layoutH, onUpdate, onClose]);

  const toggleMetric = useCallback((key: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }, []);

  // Group metrics by category
  const groups = new Map<string, typeof METRIC_CATALOG>();
  for (const m of METRIC_CATALOG) {
    const g = groups.get(m.group) || [];
    g.push(m);
    groups.set(m.group, g);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-white/10">
        <h3 className="text-sm font-semibold">Configure Widget</h3>
        <button type="button" onClick={onClose} className="text-bm-muted2 hover:text-bm-text">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Title */}
        <div>
          <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2 font-medium">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.03]"
            placeholder="Widget title"
          />
        </div>

        {/* Widget type */}
        <div>
          <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2 font-medium">Widget Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as WidgetType)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.03]"
          >
            {WIDGET_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Size presets */}
        <div>
          <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2 font-medium">Size</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {SIZE_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => { setLayoutW(p.w); setLayoutH(p.h); }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  layoutW === p.w && layoutH === p.h
                    ? "border-bm-accent bg-bm-accent/10 text-bm-accent"
                    : "border-slate-200 text-bm-muted2 hover:bg-slate-50 dark:border-white/10"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Statement type (for statement_table) */}
        {type === "statement_table" && (
          <div>
            <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2 font-medium">Statement</label>
            <div className="mt-1 flex gap-2">
              {(["IS", "CF", "BS", "KPI"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatement(s)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    statement === s
                      ? "border-bm-accent bg-bm-accent/10 text-bm-accent"
                      : "border-slate-200 text-bm-muted2 dark:border-white/10"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Period / Scenario / Comparison */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-[0.1em] text-bm-muted2">Period</label>
            <select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as typeof periodType)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-white/10 dark:bg-white/[0.03]"
            >
              {PERIOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.1em] text-bm-muted2">Scenario</label>
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value as typeof scenario)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-white/10 dark:bg-white/[0.03]"
            >
              {SCENARIO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.1em] text-bm-muted2">Compare</label>
            <select
              value={comparison}
              onChange={(e) => setComparison(e.target.value as typeof comparison)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-white/10 dark:bg-white/[0.03]"
            >
              {COMPARISON_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* Format */}
        {["trend_line", "bar_chart"].includes(type) && (
          <div>
            <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2 font-medium">Format</label>
            <div className="mt-1 flex gap-2">
              {FORMAT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setFormat(o.value)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    format === o.value
                      ? "border-bm-accent bg-bm-accent/10 text-bm-accent"
                      : "border-slate-200 text-bm-muted2 dark:border-white/10"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Metric picker */}
        {!["statement_table", "comparison_table", "text_block"].includes(type) && (
          <div>
            <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2 font-medium">
              Metrics ({selectedMetrics.length} selected)
            </label>
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-white/10">
              {Array.from(groups.entries()).map(([groupName, metrics]) => (
                <div key={groupName}>
                  <div className="sticky top-0 bg-slate-50 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-bm-muted2 font-medium dark:bg-white/[0.03]">
                    {groupName}
                  </div>
                  {metrics.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => toggleMetric(m.key)}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03] ${
                        selectedMetrics.includes(m.key) ? "text-bm-accent font-medium" : "text-bm-text"
                      }`}
                    >
                      <span className={`h-3 w-3 rounded-sm border flex items-center justify-center ${
                        selectedMetrics.includes(m.key)
                          ? "border-bm-accent bg-bm-accent"
                          : "border-slate-300 dark:border-white/20"
                      }`}>
                        {selectedMetrics.includes(m.key) && (
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </span>
                      {m.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-200 px-4 py-3 flex items-center justify-between dark:border-white/10">
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-red-500 hover:text-red-600 font-medium"
        >
          Remove Widget
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-bm-muted2 hover:bg-slate-50 dark:border-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
