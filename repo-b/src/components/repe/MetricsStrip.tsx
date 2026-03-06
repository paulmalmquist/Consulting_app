/**
 * MetricsStrip — The institutional metric band.
 *
 * Replaces React card spam with a single horizontal band.
 * Top + bottom 1px border. No background. No shadows. No rounded boxes.
 * Numbers are large. Labels are small caps. Structure, not decoration.
 *
 * Bloomberg / PitchBook visual register.
 *
 * Usage:
 *   <MetricsStrip
 *     metrics={[
 *       { label: "Funds",          value: "3" },
 *       { label: "Commitments",    value: "$2.0B" },
 *       { label: "Portfolio NAV",  value: "$1.4B" },
 *       { label: "Active Assets",  value: "33" },
 *       { label: "Avg Net IRR",    value: "8.2%",  tone: "positive" },
 *       { label: "Avg TVPI",       value: "1.61x" },
 *     ]}
 *   />
 *
 * Mobile: wraps to 2 columns on < md, 3 columns md–lg, full row lg+.
 */

import { cn } from "@/lib/cn";

type MetricTone = "positive" | "negative" | "warning" | "neutral";

const TONE_VALUE_CLASS: Record<MetricTone, string> = {
  positive: "text-bm-success",
  negative: "text-bm-danger",
  warning:  "text-bm-warning",
  neutral:  "text-bm-text",
};

export interface MetricDef {
  label: string;
  value: React.ReactNode;
  /** Optional sub-value / comparison text (e.g. "vs 9.5% target") */
  sub?: string;
  tone?: MetricTone;
}

export interface MetricsStripProps {
  metrics: MetricDef[];
  /** Additional class on the strip wrapper */
  className?: string;
  /**
   * Number of columns on large screens.
   * Defaults to the metric count, capped at 6.
   * Mobile is always 2 cols, tablet is 3.
   */
  cols?: 2 | 3 | 4 | 5 | 6;
}

const GRID_COLS: Record<2 | 3 | 4 | 5 | 6, string> = {
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
};

export function MetricsStrip({ metrics, className, cols }: MetricsStripProps) {
  const desktopCols = (cols ?? Math.min(metrics.length, 6)) as 2 | 3 | 4 | 5 | 6;
  const gridCols = GRID_COLS[desktopCols];

  return (
    <div
      role="region"
      aria-label="Portfolio metrics"
      className={cn(
        /* The band: top + bottom rule, no background */
        "grid grid-cols-2 md:grid-cols-3",
        gridCols,
        /* Border band */
        "border-y border-bm-border/[0.10]",
        className
      )}
    >
      {metrics.map(({ label, value, sub, tone }, i) => {
        const valueClass =
          tone ? TONE_VALUE_CLASS[tone] : "text-bm-text";

        /* Dividers between cells (not after last) */
        const showDivider = i < metrics.length - 1;

        return (
          <div
            key={label}
            className={cn(
              "flex flex-col justify-center px-5 py-4",
              /* Right border as column divider */
              showDivider && "border-r border-bm-border/[0.08]",
              /* Bottom border for rows that wrap on mobile/tablet */
              "border-b border-bm-border/[0.06] lg:border-b-0"
            )}
          >
            {/* Label — small caps, tracked, muted */}
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2 leading-none mb-1.5">
              {label}
            </p>

            {/* Primary value */}
            <p
              className={cn(
                "font-display text-2xl font-semibold tabular-nums leading-none",
                valueClass
              )}
            >
              {value}
            </p>

            {/* Optional sub-text */}
            {sub && (
              <p className="mt-1 text-[10px] text-bm-muted2 leading-none">
                {sub}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PageHeader — standard page header used across all REPE screens
//
// Every screen:
//   Title                          Primary Action
//   Subtitle / context
//
// ─────────────────────────────────────────────────────────────────────────────

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, action, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4",
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-bm-text truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-[12px] text-bm-muted2">{subtitle}</p>
        )}
      </div>

      {action && (
        <div className="shrink-0 flex items-center gap-2">
          {action}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PageAction — subtle institutional button (not a bright SaaS blue pill)
// ─────────────────────────────────────────────────────────────────────────────

export interface PageActionProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  /** Renders as <a> when provided */
  href?: string;
  variant?: "default" | "ghost";
}

export function PageAction({
  children,
  href,
  variant = "default",
  className,
  ...props
}: PageActionProps) {
  const base = cn(
    "inline-flex items-center gap-1.5",
    "px-3 py-2 text-[12px] font-medium",
    "border transition-all duration-fast",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-bm-accent/40",
    variant === "default"
      ? [
          "bg-bm-surface/60 border-bm-border/20 text-bm-text",
          "hover:bg-bm-surface hover:border-bm-border/40",
          "active:bg-bm-surface/40",
        ]
      : [
          "bg-transparent border-transparent text-bm-muted",
          "hover:text-bm-text hover:bg-bm-surface/40",
        ],
    className
  );

  if (href) {
    return (
      <a href={href} className={base}>
        {children}
      </a>
    );
  }

  return (
    <button type="button" className={base} {...props}>
      {children}
    </button>
  );
}
