"use client";

import { ArrowRight } from "lucide-react";
import type { Lineage } from "@/lib/historyrhymes/mlDemo";
import { ExternalResourceLinks } from "./ExternalResourceLinks";

/** Source → Transform → Model lineage with cloud links per stage. */
export function LineageMiniGraph({ lineage }: { lineage: Lineage | Record<string, never> }) {
  const l = lineage as Lineage;
  if (!l || !l.source_tables) {
    return <div className="text-[11px] text-neutral-500">No lineage available.</div>;
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-neutral-500">
        <span>Source</span>
        <ArrowRight size={11} />
        <span>Transform</span>
        <ArrowRight size={11} />
        <span>Model</span>
      </div>

      <div>
        <div className="text-[11px] font-semibold text-neutral-300 mb-1">Source tables</div>
        {l.source_tables.map((s, i) => (
          <div key={i} className="mb-2 rounded border border-neutral-800 p-2">
            <div className="text-xs font-mono text-neutral-200">{s.name}</div>
            <div className="text-[10px] text-neutral-500">{s.grain} · freshness: {s.freshness}</div>
            <div className="mt-1">
              <ExternalResourceLinks links={s.external_links} />
            </div>
          </div>
        ))}
      </div>

      <div>
        <div className="text-[11px] font-semibold text-neutral-300 mb-1">Transform steps</div>
        <ul className="space-y-1">
          {l.transform_steps.map((t, i) => (
            <li key={i} className="text-[11px] text-neutral-400">
              <span className="text-neutral-200">{t.name}</span> ({t.type}) — {t.description}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="text-[11px] font-semibold text-neutral-300 mb-1">Model artifacts</div>
        {l.model_artifacts.map((m, i) => (
          <div key={i} className="rounded border border-neutral-800 p-2">
            <div className="text-xs text-neutral-200">
              {m.name} <span className="text-neutral-500">· {m.version}</span>
            </div>
            <div className="mt-1">
              <ExternalResourceLinks links={m.external_links} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
