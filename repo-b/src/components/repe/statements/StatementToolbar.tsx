"use client";

export type PeriodType = "monthly" | "quarterly" | "annual" | "ytd" | "ttm";
export type Scenario = "actual" | "budget" | "proforma";
export type ComparisonMode = "none" | "budget" | "prior_year";
export type StatementType = "IS" | "CF" | "BS" | "KPI";

interface Props {
  statementType: StatementType;
  onStatementTypeChange: (v: StatementType) => void;
  periodType: PeriodType;
  onPeriodTypeChange: (v: PeriodType) => void;
  period: string;
  onPeriodChange: (v: string) => void;
  scenario: Scenario;
  onScenarioChange: (v: Scenario) => void;
  comparison: ComparisonMode;
  onComparisonChange: (v: ComparisonMode) => void;
  availablePeriods?: string[];
}

const STATEMENT_TABS: { key: StatementType; label: string }[] = [
  { key: "IS", label: "Income Statement" },
  { key: "CF", label: "Cash Flow" },
];

const PERIOD_TYPES: { key: PeriodType; label: string }[] = [
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
  { key: "annual", label: "Annual" },
  { key: "ytd", label: "YTD" },
  { key: "ttm", label: "TTM" },
];

const SCENARIOS: { key: Scenario; label: string }[] = [
  { key: "actual", label: "Actual" },
  { key: "budget", label: "Budget" },
  { key: "proforma", label: "Pro Forma" },
];

const COMPARISONS: { key: ComparisonMode; label: string }[] = [
  { key: "none", label: "No Comparison" },
  { key: "budget", label: "vs Budget" },
  { key: "prior_year", label: "vs Prior Year" },
];

export default function StatementToolbar({
  statementType,
  onStatementTypeChange,
  periodType,
  onPeriodTypeChange,
  period,
  onPeriodChange,
  scenario,
  onScenarioChange,
  comparison,
  onComparisonChange,
  availablePeriods,
}: Props) {
  // Period navigation
  const periodIdx = availablePeriods?.indexOf(period) ?? -1;
  const canPrev = periodIdx > 0;
  const canNext = availablePeriods ? periodIdx < availablePeriods.length - 1 : false;

  return (
    <div className="space-y-2">
      {/* Statement type tabs */}
      <div className="flex items-center gap-1 rounded-lg bg-bm-surface/30 p-0.5">
        {STATEMENT_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onStatementTypeChange(tab.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors
              ${statementType === tab.key
                ? "bg-bm-surface text-bm-text shadow-sm"
                : "text-bm-muted2 hover:text-bm-text"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {/* Period type */}
        <div className="flex items-center gap-0.5 rounded-md bg-bm-surface/20 p-0.5">
          {PERIOD_TYPES.map((pt) => (
            <button
              key={pt.key}
              type="button"
              onClick={() => onPeriodTypeChange(pt.key)}
              className={`rounded px-2 py-1 transition-colors
                ${periodType === pt.key
                  ? "bg-bm-surface text-bm-text"
                  : "text-bm-muted2 hover:text-bm-text"
                }`}
            >
              {pt.label}
            </button>
          ))}
        </div>

        {/* Period navigator */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!canPrev}
            onClick={() => canPrev && availablePeriods && onPeriodChange(availablePeriods[periodIdx - 1])}
            className="rounded p-1 text-bm-muted2 hover:text-bm-text disabled:opacity-30"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <span className="min-w-[80px] text-center font-medium">{period || "—"}</span>
          <button
            type="button"
            disabled={!canNext}
            onClick={() => canNext && availablePeriods && onPeriodChange(availablePeriods[periodIdx + 1])}
            className="rounded p-1 text-bm-muted2 hover:text-bm-text disabled:opacity-30"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Scenario */}
        <select
          value={scenario}
          onChange={(e) => onScenarioChange(e.target.value as Scenario)}
          className="rounded-md border border-bm-border/50 bg-bm-surface/20 px-2 py-1 text-xs"
        >
          {SCENARIOS.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>

        {/* Comparison */}
        <select
          value={comparison}
          onChange={(e) => onComparisonChange(e.target.value as ComparisonMode)}
          className="rounded-md border border-bm-border/50 bg-bm-surface/20 px-2 py-1 text-xs"
        >
          {COMPARISONS.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
