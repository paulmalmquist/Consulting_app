"use client";

import { useShallow } from "zustand/react/shallow";
import type { ResumeArchitectureNode } from "@/lib/bos-api";
import { useResumeWorkspaceStore } from "./useResumeWorkspaceStore";

export default function ArchitectureNodeDetail({ node }: { node: ResumeArchitectureNode }) {
  const { architectureView, selectNarrativeItem } = useResumeWorkspaceStore(
    useShallow((state) => ({
      architectureView: state.architectureView,
      selectNarrativeItem: state.selectNarrativeItem,
    })),
  );

  return (
    <div className="mt-4 rounded-2xl border border-bm-border/60 bg-bm-surface/40 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">{node.group} · {node.layer}</p>
          <h3 className="mt-1.5 text-lg font-semibold">{node.label}</h3>
          <p className="mt-2 text-sm leading-6 text-bm-muted">
            {architectureView === "technical" ? node.description : node.business_problem}
          </p>
        </div>
      </div>

      {node.tools.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {node.tools.map((tool) => (
            <span key={tool} className="rounded-full border border-bm-border/35 bg-white/5 px-2.5 py-1 text-[11px] text-bm-muted">
              {tool}
            </span>
          ))}
        </div>
      ) : null}

      {node.outcomes.length > 0 ? (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Outcomes</p>
          <ul className="mt-2 space-y-1.5">
            {node.outcomes.map((outcome) => (
              <li key={outcome} className="flex items-baseline gap-2 text-sm text-bm-muted">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/70" />
                {outcome}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {node.real_example ? (
        <div className="mt-4 rounded-xl border border-bm-border/25 bg-white/4 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Real example</p>
          <p className="mt-1.5 text-sm text-bm-text">{node.real_example}</p>
        </div>
      ) : null}

      {node.linked_timeline_ids.length > 0 ? (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Connected timeline items</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {node.linked_timeline_ids.map((timelineId) => (
              <button
                key={timelineId}
                type="button"
                onClick={() => selectNarrativeItem("initiative", timelineId, { switchModule: "timeline" })}
                className="rounded-full border border-sky-400/30 bg-sky-400/8 px-2.5 py-1 text-[11px] text-sky-300 transition hover:bg-sky-400/16"
              >
                {timelineId.replace(/^(initiative-|milestone-)/, "").replaceAll("-", " ")}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
