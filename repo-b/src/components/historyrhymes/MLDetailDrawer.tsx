"use client";

import * as React from "react";
import { X } from "lucide-react";
import type { ExternalResourceLink, Lineage } from "@/lib/historyrhymes/mlDemo";
import { ExternalResourceLinks } from "./ExternalResourceLinks";
import { LineageMiniGraph } from "./LineageMiniGraph";

export type DrawerMode =
  | "observation"
  | "feature"
  | "model"
  | "metric"
  | "cluster"
  | "prediction"
  | "source_table"
  | "training_run"
  | "lineage";

export interface DrawerPayload {
  mode: DrawerMode;
  title: string;
  subtitle?: string;
  whyItMatters?: string;
  rows?: Array<{ label: string; value: React.ReactNode }>;
  links?: ExternalResourceLink[];
  lineage?: Lineage | Record<string, never>;
  warning?: string;
}

/**
 * Dark, full-height detail drawer (own palette, NOT the shared SlideOver glass).
 * Local detail renders immediately; cloud links are evidence-only and degrade to
 * disabled-with-reason when no provider is configured.
 */
export function MLDetailDrawer({
  payload,
  onClose,
}: {
  payload: DrawerPayload | null;
  onClose: () => void;
}) {
  React.useEffect(() => {
    if (!payload) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [payload, onClose]);

  if (!payload) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={payload.title} data-testid="hr-ml-drawer">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onMouseDown={onClose} />
      <div className="relative h-full w-full max-w-lg flex flex-col bg-neutral-950 border-l border-neutral-800 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-neutral-800 px-5 py-4">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">{payload.mode.replace(/_/g, " ")} detail</div>
            <h2 className="text-base font-semibold text-neutral-100 truncate">{payload.title}</h2>
            {payload.subtitle ? <p className="text-xs text-neutral-500 truncate">{payload.subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close detail" className="text-neutral-400 hover:text-neutral-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm text-neutral-200">
          {payload.warning ? (
            <div className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-md p-2">
              {payload.warning}
            </div>
          ) : null}

          {payload.whyItMatters ? (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Why it matters</div>
              <p className="text-xs text-neutral-300">{payload.whyItMatters}</p>
            </div>
          ) : null}

          {payload.rows && payload.rows.length > 0 ? (
            <dl className="grid grid-cols-1 gap-1.5">
              {payload.rows.map((r, i) => (
                <div key={i} className="flex justify-between gap-3 border-b border-neutral-900 py-1">
                  <dt className="text-[11px] text-neutral-500">{r.label}</dt>
                  <dd className="text-xs text-neutral-200 text-right">{r.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {payload.links && payload.links.length > 0 ? (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Cloud detail</div>
              <ExternalResourceLinks links={payload.links} />
            </div>
          ) : null}

          {payload.lineage ? (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Lineage</div>
              <LineageMiniGraph lineage={payload.lineage} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
