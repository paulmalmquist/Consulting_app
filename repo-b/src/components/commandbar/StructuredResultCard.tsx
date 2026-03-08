"use client";

import { Button } from "@/components/ui/Button";
import type {
  StructuredResult,
  StructuredResultCard as CardType,
  StructuredResultMetric,
  StructuredResultAction,
} from "@/lib/commandbar/store";

function MetricRow({ metric }: { metric: StructuredResultMetric }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-bm-border/20 last:border-0">
      <span className="text-xs text-bm-muted">{metric.label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium text-bm-text">
          {metric.value ?? "—"}
        </span>
        {metric.delta && (
          <span
            className={`text-xs font-medium px-1.5 py-0.5 rounded ${
              metric.delta.direction === "positive"
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-red-500/15 text-red-400"
            }`}
          >
            {metric.delta.value}
          </span>
        )}
      </div>
    </div>
  );
}

function ParameterSection({ parameters }: { parameters: Record<string, string | null> }) {
  const entries = Object.entries(parameters).filter(([, v]) => v != null);
  if (!entries.length) return null;

  return (
    <div className="mt-2 pt-2 border-t border-bm-border/30">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-baseline gap-1">
            <span className="text-[10px] text-bm-muted2 uppercase tracking-wider">{key}</span>
            <span className="text-xs text-bm-text">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PartnerTable({ partners }: { partners: Array<Record<string, string | null>> }) {
  if (!partners.length) return null;
  const keys = ["name", "type", "committed", "contributed", "distributed", "nav_share", "tvpi", "dpi"];
  const headers = ["Name", "Type", "Committed", "Contributed", "Distributed", "NAV Share", "TVPI", "DPI"];

  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-bm-border/30">
            {headers.map((h) => (
              <th key={h} className="text-left py-1 px-1.5 text-[10px] text-bm-muted2 uppercase tracking-wider font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {partners.map((p, i) => (
            <tr key={i} className="border-b border-bm-border/10">
              {keys.map((k) => (
                <td key={k} className="py-1 px-1.5 text-bm-text">
                  {p[k] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AssetTable({ assets }: { assets: Array<Record<string, string | null>> }) {
  if (!assets.length) return null;

  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-bm-border/30">
            <th className="text-left py-1 px-1.5 text-[10px] text-bm-muted2 uppercase tracking-wider font-medium">Asset</th>
            <th className="text-right py-1 px-1.5 text-[10px] text-bm-muted2 uppercase tracking-wider font-medium">Base</th>
            <th className="text-right py-1 px-1.5 text-[10px] text-bm-muted2 uppercase tracking-wider font-medium">Stressed</th>
            <th className="text-right py-1 px-1.5 text-[10px] text-bm-muted2 uppercase tracking-wider font-medium">Impact</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((a, i) => (
            <tr key={i} className="border-b border-bm-border/10">
              <td className="py-1 px-1.5 text-bm-text">{a.name ?? "—"}</td>
              <td className="py-1 px-1.5 text-right text-bm-text">{a.base ?? "—"}</td>
              <td className="py-1 px-1.5 text-right text-bm-text">{a.stressed ?? "—"}</td>
              <td className={`py-1 px-1.5 text-right font-medium ${
                a.impact && a.impact.startsWith("-") ? "text-red-400" : "text-emerald-400"
              }`}>
                {a.impact ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
    <div className="mt-3 pt-2 border-t border-bm-border/30 flex flex-wrap gap-1.5">
      {actions.map((action) => (
        <Button
          key={action.label}
          type="button"
          size="sm"
          variant="secondary"
          className="rounded-full text-[11px] h-6"
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
      {/* Header */}
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-bm-text">{card.title}</h3>
        {card.subtitle && (
          <p className="text-[11px] text-bm-muted">{card.subtitle}</p>
        )}
      </div>

      {/* Metrics */}
      {card.metrics && card.metrics.length > 0 && (
        <div className="rounded-md border border-bm-border/20 bg-bm-bg/30 px-2.5 py-1">
          {card.metrics.map((m, i) => (
            <MetricRow key={i} metric={m} />
          ))}
        </div>
      )}

      {/* Specialized tables */}
      {card.partners && <PartnerTable partners={card.partners} />}
      {card.assets && <AssetTable assets={card.assets} />}

      {/* Parameters */}
      {card.parameters && <ParameterSection parameters={card.parameters} />}

      {/* Actions */}
      {card.actions && <ActionBar actions={card.actions} onAction={handleAction} />}
    </div>
  );
}
