"use client";

import type { NvFinancialSnapshot } from "@/types/nv-accounting";
import { fmtUSD } from "@/components/operator/command-desk";

type PillProps = {
  label: string;
  value: number | null;
  status?: "live" | "unavailable";
  unavailableReason?: string | null;
  color: string;
  last?: boolean;
};

function Pill({ label, value, status = "live", unavailableReason, color, last }: PillProps) {
  const unavailable = status === "unavailable" || value === null;
  return (
    <div
      title={unavailable && unavailableReason ? unavailableReason.replace(/_/g, " ") : undefined}
      style={{
        flex: 1,
        padding: "10px 16px",
        borderRight: last ? "none" : "1px solid var(--line-2)",
        display: "flex",
        flexDirection: "column",
        gap: 3,
        cursor: unavailable ? "help" : "default",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: ".10em",
          textTransform: "uppercase",
          color: "var(--fg-3)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 14,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          color: unavailable ? "var(--fg-4)" : color,
        }}
      >
        {unavailable ? "—" : fmtUSD(value!)}
      </span>
    </div>
  );
}

type Props = { snapshot: NvFinancialSnapshot | null };

export function SnapshotStrip({ snapshot }: Props) {
  if (!snapshot) {
    return (
      <div
        style={{
          display: "flex",
          background: "var(--bg-inset)",
          borderBottom: "1px solid var(--line-2)",
          height: 56,
          alignItems: "center",
          padding: "0 16px",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--fg-4)",
        }}
      >
        Loading financial snapshot…
      </div>
    );
  }

  const net = snapshot.net_30d;
  const netColor = net == null ? "var(--fg-4)" : net >= 0 ? "var(--sem-up)" : "var(--sem-down)";
  const cashColor =
    snapshot.cash_balance == null
      ? "var(--fg-4)"
      : snapshot.cash_balance >= 0
      ? "var(--sem-up)"
      : "var(--sem-down)";

  return (
    <div
      style={{
        display: "flex",
        background: "var(--bg-inset)",
        borderBottom: "1px solid var(--line-2)",
      }}
    >
      <Pill
        label="Cash Balance"
        value={snapshot.cash_balance}
        status={snapshot.cash_balance_status}
        unavailableReason={snapshot.cash_balance_unavailable_reason}
        color={cashColor}
      />
      <Pill
        label="In 30D"
        value={snapshot.cash_in_30d}
        status={snapshot.cash_in_30d_status}
        unavailableReason={snapshot.cash_in_30d_unavailable_reason}
        color="var(--sem-up)"
      />
      <Pill
        label="Out 30D"
        value={snapshot.cash_out_30d}
        status={snapshot.cash_out_30d_status}
        unavailableReason={snapshot.cash_out_30d_unavailable_reason}
        color="var(--neon-magenta)"
      />
      <Pill
        label="Net 30D"
        value={net}
        status={net == null ? "unavailable" : "live"}
        color={netColor}
      />
      <Pill
        label="Receivables"
        value={snapshot.unpaid_receivables}
        color="var(--neon-amber)"
      />
      <Pill
        label="MRR Software"
        value={snapshot.mrr_software}
        color="var(--neon-violet)"
        last
      />
    </div>
  );
}
