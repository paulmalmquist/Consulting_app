"use client";

import type { FiCovenantResult, ReV2FundInvestmentRollupRow } from "@/lib/bos-api";
import {
  computeConcentrations,
  concentrationFlags,
  covenantFlags,
  dscrLtvFlags,
  rankFlags,
  type ConcentrationEntry,
  type FlagSeverity,
  type RiskFlag,
} from "@/components/repe/workspace/repePortfolioFlags";
import { fmtMoney } from "@/lib/format-utils";

interface Props {
  rollup: ReV2FundInvestmentRollupRow[];
  covenants?: FiCovenantResult[] | null;
  concentrationThresholdPct?: number;
  snapshotVersion?: string | null;
}

const PALETTE = [
  "#38BDF8",
  "#34D399",
  "#FBBF24",
  "#A78BFA",
  "#F87171",
  "#94A3B8",
];

const SEVERITY_DOT: Record<FlagSeverity, string> = {
  high: "bg-bm-danger",
  medium: "bg-bm-warning",
  low: "bg-bm-borderStrong",
};

export default function ExposureRiskPanel({
  rollup,
  covenants,
  concentrationThresholdPct,
  snapshotVersion,
}: Props) {
  const { sector, geography } = computeConcentrations(rollup, 5);
  const flags = rankFlags([
    ...concentrationFlags(rollup, concentrationThresholdPct),
    ...dscrLtvFlags(rollup),
    ...covenantFlags(covenants),
  ]);

  return (
    <section
      data-testid="exposure-risk-panel"
      aria-label="Exposure and risk"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.14)] dark:border-bm-border/[0.08] dark:bg-bm-surface/[0.92]"
    >
      <div className="grid gap-5 md:grid-cols-2">
        <ExposureColumn
          eyebrow="Top exposures · Sector"
          entries={sector}
          thresholdPct={concentrationThresholdPct ?? 25}
        />
        <ExposureColumn
          eyebrow="Top exposures · Geography"
          entries={geography}
          thresholdPct={concentrationThresholdPct ?? 25}
        />
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4 dark:border-bm-border/[0.08]">
        <div className="text-[11px] font-medium uppercase tracking-wide text-bm-muted">
          Risk flags
        </div>
        <ul className="mt-2 space-y-1.5" data-testid="exposure-risk-flags">
          {flags.length > 0 ? (
            flags.map((flag) => <RiskFlagRow key={flag.key} flag={flag} />)
          ) : (
            <li className="text-sm text-bm-muted">No risk flags above thresholds</li>
          )}
        </ul>
      </div>

      {snapshotVersion ? (
        <div className="mt-3 border-t border-slate-100 pt-2 text-[10px] uppercase tracking-wide text-bm-muted dark:border-bm-border/[0.08]">
          Snapshot <span className="font-mono">{snapshotVersion}</span>
        </div>
      ) : null}
    </section>
  );
}

function ExposureColumn({
  eyebrow,
  entries,
  thresholdPct,
}: {
  eyebrow: string;
  entries: ConcentrationEntry[];
  thresholdPct: number;
}) {
  if (!entries.length) {
    return (
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wide text-bm-muted">
          {eyebrow}
        </div>
        <div className="mt-2 text-sm text-bm-muted">Awaiting sector allocation</div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-bm-muted">
        {eyebrow}
      </div>
      <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-bm-border/[0.10]">
        {entries.map((entry, idx) => (
          <div
            key={`${entry.label}-bar`}
            className="h-full"
            title={`${entry.label} — ${entry.pct.toFixed(1)}%`}
            style={{
              width: `${Math.max(1, entry.pct)}%`,
              backgroundColor: PALETTE[idx % PALETTE.length],
            }}
          />
        ))}
      </div>
      <table className="mt-3 w-full text-sm tabular-nums">
        <tbody>
          {entries.map((entry, idx) => {
            const overThreshold = entry.pct >= thresholdPct;
            return (
              <tr
                key={entry.label}
                className={overThreshold ? "text-bm-warning" : "text-bm-ink"}
              >
                <td className="py-1 pr-2 w-3">
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ backgroundColor: PALETTE[idx % PALETTE.length] }}
                  />
                </td>
                <td className="py-1 pr-2 truncate">{entry.label}</td>
                <td className="py-1 pr-2 text-right font-semibold">{entry.pct.toFixed(1)}%</td>
                <td className="py-1 text-right text-xs text-bm-muted">{fmtMoney(entry.navShare)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RiskFlagRow({ flag }: { flag: RiskFlag }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span
        aria-hidden
        className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${SEVERITY_DOT[flag.severity]}`}
      />
      <span>
        <span className="text-bm-ink">{flag.label}</span>
        {flag.detail ? <span className="block text-xs text-bm-muted">{flag.detail}</span> : null}
      </span>
    </li>
  );
}
