"use client";

import type { ResumeDeployment } from "@/lib/bos-api";
import { usePerspective } from "./PerspectiveContext";

function fmtDate(d: string | null): string {
  if (!d) return "Present";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short" });
}

const SYSTEM_TYPE_LABELS: Record<string, string> = {
  data_warehouse: "Data Warehouse",
  ai_platform: "AI Platform",
  bi_service_line: "BI Service Line",
  full_stack_platform: "Full-Stack Platform",
};

export default function DeploymentCards({ deployments }: { deployments: ResumeDeployment[] }) {
  const { perspective } = usePerspective();

  return (
    <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-6">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-bm-muted2">
        System Deployments
      </h2>
      <p className="mb-6 text-sm text-bm-muted">
        {perspective === "executive"
          ? "Transformations delivered across organizations"
          : perspective === "investor"
            ? "Scale and outcomes of each deployment"
            : "Architecture and implementation of each system"}
      </p>

      <div className="space-y-4">
        {deployments.map((d) => {
          const beforeEntries = Object.entries(d.before_state);
          const afterEntries = Object.entries(d.after_state);

          return (
            <div
              key={d.deployment_id}
              className="rounded-xl border border-bm-border/50 bg-bm-surface/10 p-5"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{d.deployment_name}</h3>
                  <p className="mt-0.5 text-sm text-bm-muted2">
                    {d.company} &middot; {fmtDate(d.start_date)} &mdash; {fmtDate(d.end_date)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-bm-border/50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-bm-muted2">
                    {SYSTEM_TYPE_LABELS[d.system_type] || d.system_type}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {d.status === "active" ? (
                      <>
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        </span>
                        <span className="text-[10px] font-medium uppercase text-emerald-400">Active</span>
                      </>
                    ) : (
                      <>
                        <span className="h-2 w-2 rounded-full bg-sky-500" />
                        <span className="text-[10px] font-medium uppercase text-sky-400">Completed</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Problem */}
              {d.problem && (
                <div className="mt-3">
                  <p className="text-[10px] uppercase tracking-wider text-bm-muted2">Problem</p>
                  <p className="mt-0.5 text-sm text-bm-muted">{d.problem}</p>
                </div>
              )}

              {/* Architecture (engineer + executive) */}
              {d.architecture && (perspective === "engineer" || perspective === "executive") && (
                <div className="mt-3">
                  <p className="text-[10px] uppercase tracking-wider text-bm-muted2">Architecture</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {d.architecture.split(" + ").map((tech) => (
                      <span
                        key={tech}
                        className="rounded-full border border-bm-border/70 px-2 py-0.5 text-[10px] text-bm-muted2"
                      >
                        {tech.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Before / After */}
              {beforeEntries.length > 0 && afterEntries.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-bm-muted2 mb-2">Before</p>
                    <div className="space-y-1.5">
                      {beforeEntries.map(([key, val]) => (
                        <div key={key}>
                          <p className="text-[10px] text-bm-muted2 capitalize">{key.replace(/_/g, " ")}</p>
                          <p className="text-xs text-bm-muted">{val}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-emerald-400/70 mb-2">After</p>
                    <div className="space-y-1.5">
                      {afterEntries.map(([key, val]) => (
                        <div key={key}>
                          <p className="text-[10px] text-bm-muted2 capitalize">{key.replace(/_/g, " ")}</p>
                          <p className="text-xs font-medium text-emerald-400">{val}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
