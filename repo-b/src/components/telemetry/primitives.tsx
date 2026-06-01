import { cn } from "@/lib/cn";

export function PageHeader({
  eyebrow,
  title,
  blurb,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
}) {
  return (
    <header className="mb-6 space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-bm-muted2">
        {eyebrow}
      </p>
      <h1 className="text-2xl font-semibold text-bm-text lg:text-3xl">{title}</h1>
      <p className="max-w-3xl text-sm text-bm-muted">{blurb}</p>
    </header>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-bm-border/70 bg-bm-surface/35 p-4", className)}>
      {children}
    </div>
  );
}

export function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <p className="text-[11px] font-medium uppercase tracking-wider text-bm-muted2">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-bm-text">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-bm-muted">{sub}</p> : null}
    </Card>
  );
}

export function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-bm-muted2">{label}</span>
      <span className="text-right tabular-nums text-bm-text">{value}</span>
    </div>
  );
}

/** Public-data disclaimer footer (must appear on the demo surface). */
export function PublicDataFooter() {
  return (
    <p className="mt-8 border-t border-bm-border/60 pt-3 text-[11px] leading-relaxed text-bm-muted2">
      Built on public NASA aerospace analog datasets (C-MAPSS turbofan, SMAP/MSL telemanom, IMS
      bearing). Not proprietary data. Datasets are analogs chosen because they share engine-test
      telemetry characteristics.
    </p>
  );
}

/** Explicit, fail-closed states — never blank, never a silent zero. */
export function Loading({ label = "Loading…" }: { label?: string }) {
  return <Card className="text-sm text-bm-muted">{label}</Card>;
}

export function ErrorState({ message }: { message: string }) {
  return (
    <Card className="border-rose-400/40 bg-rose-400/10 text-sm text-rose-300">
      Could not load this panel: {message}
    </Card>
  );
}

export function Unavailable({ reason }: { reason: string }) {
  return (
    <Card className="border-amber-400/40 bg-amber-400/10 text-sm text-amber-200">
      Not available — <span className="font-mono">{reason}</span>
    </Card>
  );
}
