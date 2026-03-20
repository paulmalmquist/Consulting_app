"use client";

import type { ResumeProject } from "@/lib/bos-api";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "border-emerald-500/50 text-emerald-400",
    completed: "border-sky-500/50 text-sky-400",
    concept: "border-amber-500/50 text-amber-400",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${colors[status] || "border-bm-border text-bm-muted2"}`}>
      {status}
    </span>
  );
}

export default function ProjectShowcase({ projects }: { projects: ResumeProject[] }) {
  return (
    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-bm-muted2">
        Key Projects
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <div
            key={p.project_id}
            className="rounded-lg border border-bm-border/50 bg-bm-surface/10 p-4 flex flex-col"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-sm">{p.name}</h3>
              <StatusBadge status={p.status} />
            </div>
            {p.client && (
              <p className="mt-1 text-xs text-bm-muted2">{p.client}</p>
            )}
            {p.summary && (
              <p className="mt-2 text-xs text-bm-muted line-clamp-3">{p.summary}</p>
            )}
            {p.metrics.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {p.metrics.map((m, i) => (
                  <div key={i}>
                    <p className="text-[10px] uppercase tracking-wider text-bm-muted2">{m.label}</p>
                    <p className="text-sm font-semibold">{m.value}</p>
                  </div>
                ))}
              </div>
            )}
            {p.technologies.length > 0 && (
              <div className="mt-auto pt-3 flex flex-wrap gap-1">
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
            {p.url && (
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 text-xs text-sky-400 hover:underline"
              >
                View Live &rarr;
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
