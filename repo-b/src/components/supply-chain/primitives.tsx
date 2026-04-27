import { cn } from "@/lib/cn";
import type { Health, Trust } from "@/lib/supply-chain/seed";

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

export function Section({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-bm-text">{title}</h2>
        {caption ? <p className="text-xs text-bm-muted2">{caption}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-bm-border/70 bg-bm-surface/35 p-4",
        className
      )}
    >
      {children}
    </div>
  );
}

// Colors use light defaults + dark: overrides; the codebase darkMode
// selector treats absence of data-theme="light" as dark, so dark: applies
// in the executive theme and the un-prefixed classes apply in light mode.
const HEALTH_STYLES: Record<Health, string> = {
  green:
    "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-300",
  amber:
    "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-300",
  red:
    "border-rose-500/50 bg-rose-500/15 text-rose-700 dark:border-rose-400/40 dark:bg-rose-400/10 dark:text-rose-300",
};

export function HealthChip({
  status,
  label,
  className,
}: {
  status: Health;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        HEALTH_STYLES[status],
        className
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "green" && "bg-emerald-400",
          status === "amber" && "bg-amber-400",
          status === "red" && "bg-rose-400"
        )}
      />
      {label || status}
    </span>
  );
}

const TRUST_LABEL: Record<Trust, string> = {
  certified: "Certified",
  in_review: "In review",
  draft: "Draft",
  deprecated: "Deprecated",
};

const TRUST_STYLES: Record<Trust, string> = {
  certified:
    "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-300",
  in_review:
    "border-sky-500/50 bg-sky-500/15 text-sky-700 dark:border-sky-400/40 dark:bg-sky-400/10 dark:text-sky-300",
  draft: "border-bm-border/70 bg-bm-surface/40 text-bm-muted",
  deprecated:
    "border-rose-500/50 bg-rose-500/15 text-rose-700 dark:border-rose-400/40 dark:bg-rose-400/10 dark:text-rose-300",
};

export function TrustBadge({ trust }: { trust: Trust }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        TRUST_STYLES[trust]
      )}
    >
      {TRUST_LABEL[trust]}
    </span>
  );
}

export function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-bm-muted2">{label}</span>
      <span className="text-bm-text text-right">{value}</span>
    </div>
  );
}

export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-bm-border/70 bg-bm-surface/40 px-2 py-0.5 text-[11px] text-bm-muted">
      {children}
    </span>
  );
}
