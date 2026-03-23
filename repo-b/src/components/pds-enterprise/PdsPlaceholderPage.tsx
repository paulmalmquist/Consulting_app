export function PdsPlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-3xl border border-bm-border/70 bg-bm-surface/20 p-8">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-pds-gold/60">Coming Soon</p>
      <h2 className="mt-2 text-2xl font-semibold">{title}</h2>
      <p className="mt-3 text-sm text-bm-muted2">{description}</p>
    </div>
  );
}
