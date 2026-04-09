"use client";

import React, { useEffect, useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { getPortfolioSignals, type PortfolioSignal } from "@/lib/bos-api";
import { useRepeContext } from "@/lib/repe-context";
import { usePortfolioFilters } from "./PortfolioFilterContext";
import { useRepeBasePath } from "@/lib/repe-context";

// ---------------------------------------------------------------------------
// Severity styling
// ---------------------------------------------------------------------------

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  warning: "bg-amber-400",
  info: "bg-blue-400",
  positive: "bg-emerald-400",
};

const SEVERITY_BG: Record<string, string> = {
  critical: "bg-red-500/8 border-red-500/20",
  warning: "bg-amber-500/8 border-amber-500/20",
  info: "bg-blue-500/8 border-blue-500/20",
  positive: "bg-emerald-500/8 border-emerald-500/20",
};

// ---------------------------------------------------------------------------
// Attribution Panel (expanded view)
// ---------------------------------------------------------------------------

function AttributionPanel({ signal }: { signal: PortfolioSignal }) {
  const basePath = useRepeBasePath();
  const attr = signal.attribution_payload;
  if (!attr || !attr.breakdown.length) return null;

  return (
    <div className="mt-2 space-y-2 border-t border-bm-border/15 pt-2">
      {/* Breakdown table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="text-bm-muted2">
              <th className="text-left py-0.5 pr-2">Asset</th>
              <th className="text-left py-0.5 pr-2">Fund</th>
              {attr.breakdown[0] && Object.keys(attr.breakdown[0]).filter(
                (k) => !["asset_name", "fund"].includes(k)
              ).map((k) => (
                <th key={k} className="text-right py-0.5 pr-2 capitalize">
                  {k.replace(/_/g, " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {attr.breakdown.map((item, i) => (
              <tr key={i} className="border-t border-bm-border/10">
                <td className="py-1 pr-2 text-bm-text">{item.asset_name}</td>
                <td className="py-1 pr-2 text-bm-muted2">{item.fund}</td>
                {Object.entries(item).filter(
                  ([k]) => !["asset_name", "fund"].includes(k)
                ).map(([k, v]) => (
                  <td key={k} className="py-1 pr-2 text-right font-mono text-bm-muted2">
                    {v != null ? String(v) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recommended actions */}
      {signal.recommended_actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {signal.recommended_actions.map((action, i) => (
            <button
              key={i}
              type="button"
              className="rounded border border-bm-border/30 px-2 py-1 text-[10px] text-bm-muted2 hover:text-bm-accent hover:border-bm-accent/40 transition-colors"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signal Card
// ---------------------------------------------------------------------------

function SignalCard({ signal }: { signal: PortfolioSignal }) {
  const [expanded, setExpanded] = useState(false);
  const { setSignalScope, ui } = usePortfolioFilters();

  const isActive = ui.signalScope?.signalId === signal.signal_id;
  const dotColor = SEVERITY_DOT[signal.severity] || SEVERITY_DOT.info;
  const bgColor = SEVERITY_BG[signal.severity] || SEVERITY_BG.info;

  const handleClick = () => {
    if (isActive) {
      setSignalScope(null);
    } else {
      setSignalScope({
        signalId: signal.signal_id,
        filterOverrides: signal.filter_overrides,
      });
    }
  };

  return (
    <div className={`rounded-md border ${bgColor} ${isActive ? "ring-1 ring-bm-accent/30" : ""} p-2 min-w-[240px] transition-all`}>
      <div className="flex items-start gap-2">
        <span className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${dotColor}`} />
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={handleClick}
            className="text-left text-xs font-medium text-bm-text hover:text-bm-accent transition-colors leading-tight"
          >
            {signal.headline}
          </button>
          <p className="text-[10px] text-bm-muted2 mt-0.5 line-clamp-2">{signal.detail}</p>
        </div>
        {signal.attribution_payload && signal.attribution_payload.breakdown.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex-shrink-0 p-0.5 rounded hover:bg-bm-border/20 transition-colors"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5 text-bm-muted2" />
              : <ChevronRight className="h-3.5 w-3.5 text-bm-muted2" />
            }
          </button>
        )}
      </div>
      {expanded && <AttributionPanel signal={signal} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signals Strip
// ---------------------------------------------------------------------------

export function PortfolioSignalsStrip() {
  const { environmentId } = useRepeContext();
  const { filters } = usePortfolioFilters();
  const [signals, setSignals] = useState<PortfolioSignal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!environmentId) return;
    setLoading(true);
    getPortfolioSignals(environmentId, filters.quarter)
      .then(setSignals)
      .catch(() => setSignals([]))
      .finally(() => setLoading(false));
  }, [environmentId, filters.quarter]);

  if (loading) {
    return (
      <div className="flex gap-2 overflow-x-auto">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-[56px] w-[240px] flex-shrink-0 animate-pulse rounded-md bg-bm-surface/20 border border-bm-border/10" />
        ))}
      </div>
    );
  }

  if (signals.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      {signals.map((signal) => (
        <SignalCard key={signal.signal_id} signal={signal} />
      ))}
    </div>
  );
}
