"use client";

export interface ScopeMetadata {
  investment_count?: number | null;
  expected_investment_count?: number | null;
  scope_completeness?: string | null;
  scope_contract_version?: string | null;
}

interface ScopeBadgeProps {
  scope: ScopeMetadata | null | undefined;
  className?: string;
}

const STYLE: Record<string, { bg: string; fg: string; dot: string }> = {
  complete: {
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    fg: "text-emerald-800 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  partial: {
    bg: "bg-amber-100 dark:bg-amber-900/30",
    fg: "text-amber-800 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  over_scope: {
    bg: "bg-amber-100 dark:bg-amber-900/30",
    fg: "text-amber-800 dark:text-amber-300",
    dot: "bg-amber-500",
  },
};

const FALLBACK = {
  bg: "bg-slate-100 dark:bg-slate-800/30",
  fg: "text-slate-500 dark:text-slate-400",
  dot: "bg-slate-400",
};

export function ScopeBadge({ scope, className }: ScopeBadgeProps) {
  if (!scope) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${FALLBACK.bg} ${FALLBACK.fg} ${className ?? ""}`}
        title="Scope metadata unavailable"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${FALLBACK.dot}`} />
        Scope —
      </span>
    );
  }

  const completeness = scope.scope_completeness ?? "unknown";
  const style = STYLE[completeness] ?? FALLBACK;
  const inScope = scope.investment_count;
  const expected = scope.expected_investment_count;
  const label =
    inScope != null && expected != null
      ? `${inScope}/${expected}`
      : completeness.replace(/_/g, " ");

  const title = [
    `Scope: ${completeness}`,
    inScope != null ? `in scope: ${inScope}` : null,
    expected != null ? `expected: ${expected}` : null,
    scope.scope_contract_version ? `contract: ${scope.scope_contract_version}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.bg} ${style.fg} ${className ?? ""}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      Scope {label}
    </span>
  );
}
