import * as React from "react";
import { cn } from "@/lib/cn";

export type OperationsKpi = {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
};

export type LifecycleItem = {
  key: string;
  label: string;
  count: number;
  amount: React.ReactNode;
};

export function OperationsHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
      <div className="max-w-3xl space-y-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Investor Operations</p>
        <h2 className="font-display text-2xl font-semibold text-bm-text">{title}</h2>
        <p className="text-sm text-bm-muted2">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function OperationsActionButton({
  label,
  onClick,
  icon,
  variant = "secondary",
  disabled = false,
}: {
  label: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
}) {
  const classes = {
    primary: "border-bm-accent bg-bm-accent text-bm-accentContrast hover:-translate-y-[1px]",
    secondary: "border-bm-border/40 bg-bm-surface/50 text-bm-text hover:bg-bm-surface/70",
    ghost: "border-bm-border/25 bg-transparent text-bm-muted hover:text-bm-text",
  }[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition-[background-color,color,transform] duration-100 disabled:cursor-not-allowed disabled:opacity-50",
        classes
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function OperationsKpiGrid({ kpis }: { kpis: OperationsKpi[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className="rounded-2xl border border-bm-border/30 bg-bm-surface/45 px-4 py-4 shadow-[0_12px_32px_-24px_rgba(0,0,0,0.8)]"
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-bm-muted2">{kpi.label}</p>
          <p className="mt-3 font-display text-[30px] font-semibold leading-none text-bm-text tabular-nums">
            {kpi.value}
          </p>
          {kpi.detail ? <p className="mt-2 text-xs text-bm-muted2">{kpi.detail}</p> : null}
        </div>
      ))}
    </div>
  );
}

export function LifecycleStrip({ items }: { items: LifecycleItem[] }) {
  return (
    <div className="rounded-2xl border border-bm-border/30 bg-bm-surface/35 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-bm-muted2">Lifecycle</p>
          <p className="text-sm text-bm-muted2">Operational state coverage across the current result set.</p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <div key={item.key} className="rounded-xl border border-bm-border/20 bg-bm-surface/40 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-bm-text">{item.label}</p>
              <p className="font-display text-xl font-semibold text-bm-text tabular-nums">{item.count}</p>
            </div>
            <p className="mt-2 text-xs text-bm-muted2">Amount</p>
            <p className="mt-1 text-sm font-medium text-bm-text tabular-nums">{item.amount}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OperationsSectionCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-bm-border/30 bg-bm-surface/30 p-4", className)}>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-bm-text">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-bm-muted2">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function OperationsFilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-bm-border/25 bg-bm-surface/20 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-bm-muted2">Filters</p>
          <p className="text-sm text-bm-muted2">Refine the operating queue by status, fund, investor, and timing.</p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{children}</div>
    </div>
  );
}

export function OperationsField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs uppercase tracking-[0.12em] text-bm-muted2">
      {label}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export function OperationsInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "block h-10 w-full rounded-xl border border-bm-border/30 bg-bm-surface/45 px-3 text-sm text-bm-text placeholder:text-bm-muted2",
        props.className
      )}
    />
  );
}

export function OperationsSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "block h-10 w-full rounded-xl border border-bm-border/30 bg-bm-surface/45 px-3 text-sm text-bm-text",
        props.className
      )}
    />
  );
}

export function OperationsTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "block min-h-[92px] w-full rounded-xl border border-bm-border/30 bg-bm-surface/45 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2",
        props.className
      )}
    />
  );
}

export function OperationsStatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "positive" | "warning" | "danger";
}) {
  const toneClass = {
    neutral: "border-bm-border/30 bg-bm-surface/50 text-bm-muted",
    positive: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    warning: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    danger: "border-rose-500/20 bg-rose-500/10 text-rose-300",
  }[tone];

  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", toneClass)}>
      {label}
    </span>
  );
}

export function GuidedEmptyState({
  title,
  description,
  bullets,
  actions,
  compact = false,
}: {
  title: string;
  description: string;
  bullets: string[];
  actions?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-bm-border/45 bg-bm-surface/20",
        compact ? "px-4 py-4" : "px-6 py-8"
      )}
    >
      <div className="max-w-3xl">
        <h4 className="font-display text-lg font-semibold text-bm-text">{title}</h4>
        <p className="mt-2 text-sm text-bm-muted2">{description}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {bullets.map((bullet) => (
            <span key={bullet} className="rounded-full border border-bm-border/30 bg-bm-surface/45 px-3 py-1 text-xs text-bm-muted">
              {bullet}
            </span>
          ))}
        </div>
        {actions ? <div className="mt-5 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function InsightList({
  title,
  subtitle,
  emptyLabel,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  emptyLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const content = React.Children.toArray(children);
  return (
    <OperationsSectionCard title={title} subtitle={subtitle} className={className}>
      {content.length > 0 ? (
        <div className="space-y-3">{content}</div>
      ) : (
        <p className="text-sm text-bm-muted2">{emptyLabel || "No records available."}</p>
      )}
    </OperationsSectionCard>
  );
}
