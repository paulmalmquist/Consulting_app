"use client";

import { useState } from "react";
import type { ResumeProject } from "@/lib/bos-api";
import { usePerspective } from "./PerspectiveContext";

function StatusDot({ status }: { status: string }) {
  if (status === "active") {
    return (
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
    );
  }
  return <span className="h-2 w-2 rounded-full bg-sky-500" />;
}

export default function ProjectShowcase({ projects }: { projects: ResumeProject[] }) {
  const { perspective } = usePerspective();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-6">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-bm-muted2">
        Live Services
      </h2>
      <p className="mb-6 text-sm text-bm-muted">
        {perspective === "executive"
          ? "Active and completed systems with business impact"
          : perspective === "investor"
            ? "Portfolio of deployed technology assets"
            : "Production systems with architecture details"}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => {
          const isExpanded = expandedId === p.project_id;

          return (
            <div
              key={p.project_id}
              className="rounded-xl border border-bm-border/50 bg-bm-surface/10 p-4 flex flex-col"
            >
              {/* Header with status */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StatusDot status={p.status} />
                  <h3 className="font-semibold text-sm">{p.name}</h3>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-bm-muted2">
                  {p.status}
                </span>
              </div>

              {p.client && (
                <p className="mt-1 text-xs text-bm-muted2">{p.client}</p>
              )}

              {/* Summary (always shown) */}
              {p.summary && (
                <p className={`mt-2 text-xs text-bm-muted ${isExpanded ? "" : "line-clamp-2"}`}>
                  {p.summary}
                </p>
              )}

              {/* Expanded: impact + full metrics */}
              {isExpanded && (
                <div className="mt-3 animate-in fade-in duration-200">
                  {p.impact && (
                    <div className="mb-3">
                      <p className="text-[10px] uppercase tracking-wider text-bm-muted2">Impact</p>
                      <p className="mt-0.5 text-xs text-emerald-400">{p.impact}</p>
                    </div>
                  )}

                  {p.metrics.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {p.metrics.map((m, i) => (
                        <div key={i}>
                          <p className="text-[10px] uppercase tracking-wider text-bm-muted2">{m.label}</p>
                          <p className="text-sm font-semibold">{m.value}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {perspective === "engineer" && p.technologies.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {p.technologies.map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-bm-border/70 px-2 py-0.5 text-[10px] text-bm-muted2"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="mt-auto pt-3 flex items-center gap-3">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : p.project_id)}
                  className="text-xs text-sky-400 hover:text-sky-300 transition-colors"
                >
                  {isExpanded ? "Collapse" : "Inspect System"} &rarr;
                </button>
                {p.url && (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    View Live &rarr;
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
