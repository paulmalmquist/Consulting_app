export function PdsPlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-3xl border border-bm-border/70 bg-[radial-gradient(circle_at_top_left,hsl(var(--pds-accent)/0.08),transparent_42%)] bg-bm-surface/20 p-6 sm:p-8">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">Preview State</p>
      <h2 className="mt-2 text-2xl font-semibold">{title}</h2>
      <p className="mt-3 text-sm leading-7 text-bm-muted2">{description}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-bm-border/60 bg-bm-surface/15 px-4 py-4 text-sm text-bm-muted2">
          This surface will answer a focused operating question instead of duplicating the full command center.
        </div>
        <div className="rounded-2xl border border-bm-border/60 bg-bm-surface/15 px-4 py-4 text-sm text-bm-muted2">
          Shared PDS metrics, staffing, and project signals already flow through the home, revenue, and risk views.
        </div>
        <div className="rounded-2xl border border-bm-border/60 bg-bm-surface/15 px-4 py-4 text-sm text-bm-muted2">
          Mobile keeps this in preview mode until the focused analytic module is ready to replace the overview.
        </div>
      </div>
    </div>
  );
}
