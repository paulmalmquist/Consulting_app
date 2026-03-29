"use client";

export function DomainPreviewState({
  title,
  description,
  envId,
  businessId,
}: {
  title: string;
  description: string;
  envId: string;
  businessId?: string | null;
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-bm-border/70 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-5 sm:p-6">
        <p className="text-[10px] uppercase tracking-[0.18em] text-bm-muted2">Preview State</p>
        <h2 className="mt-2 text-2xl font-semibold text-bm-text">{title}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-bm-muted2">{description}</p>
        <p className="mt-4 text-xs text-bm-muted2">
          Environment: {envId}
          {businessId ? ` · Business: ${businessId.slice(0, 8)}` : ""}
        </p>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-bm-border/60 bg-bm-surface/20 p-4 text-sm text-bm-muted2">
          This module is reserved for a narrower operating question than the environment command center.
        </div>
        <div className="rounded-2xl border border-bm-border/60 bg-bm-surface/20 p-4 text-sm text-bm-muted2">
          Shared environment data and context still flow through the adjacent live modules in this workspace.
        </div>
        <div className="rounded-2xl border border-bm-border/60 bg-bm-surface/20 p-4 text-sm text-bm-muted2">
          Mobile keeps the preview short and explanatory so the user can continue deeper work without losing context.
        </div>
      </section>
    </div>
  );
}
