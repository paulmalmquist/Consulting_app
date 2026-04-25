"use client";

import { useState } from "react";
import { fmtUSD, DualAreaChart } from "@/components/operator/command-desk";
import type { NvIncomeStatement, NvCashMovementTrend, NvBalanceSnapshot } from "@/types/nv-accounting";

type SubView = "income" | "cash" | "balance";

type Props = {
  income: NvIncomeStatement | null;
  cash: NvCashMovementTrend | null;
  balance: NvBalanceSnapshot | null;
};

const SEG_STYLES = {
  base: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    letterSpacing: ".08em",
    textTransform: "uppercase" as const,
    padding: "4px 14px",
    border: "1px solid var(--line-3)",
    cursor: "pointer",
    background: "transparent",
    color: "var(--fg-3)",
  },
  active: {
    background: "rgba(0,220,255,0.08)",
    borderColor: "var(--neon-cyan)",
    color: "var(--neon-cyan)",
  },
};

function Row({ label, values, accent, bold }: { label: string; values: (number | null)[]; accent?: string; bold?: boolean }) {
  return (
    <tr>
      <td
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: accent ?? "var(--fg-2)",
          padding: "7px 14px 7px 0",
          whiteSpace: "nowrap",
          fontWeight: bold ? 600 : undefined,
        }}
      >
        {label}
      </td>
      {values.map((v, i) => (
        <td
          key={i}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontVariantNumeric: "tabular-nums",
            textAlign: "right",
            padding: "7px 10px",
            color: v == null ? "var(--fg-4)" : (accent ?? (v >= 0 ? "var(--fg-1)" : "var(--sem-down)")),
            fontWeight: bold ? 600 : undefined,
          }}
        >
          {v == null ? "—" : fmtUSD(v)}
        </td>
      ))}
    </tr>
  );
}

function IncomeView({ income }: { income: NvIncomeStatement | null }) {
  if (!income) {
    return <div style={{ padding: 24, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-4)" }}>Loading…</div>;
  }
  const cats = Object.keys(income.expenses_by_cat);
  const thStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    letterSpacing: ".10em",
    textTransform: "uppercase",
    color: "var(--fg-3)",
    textAlign: "right",
    padding: "6px 10px",
    fontWeight: 400,
  };
  return (
    <div style={{ overflowX: "auto", padding: "0 0 16px" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: "left", paddingLeft: 0 }}></th>
            {income.months.map((m) => (
              <th key={m} style={thStyle}>{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <Row label="REVENUE" values={income.revenue} accent="var(--sem-up)" bold />
          <tr><td colSpan={income.months.length + 1} style={{ borderTop: "1px solid var(--line-2)", padding: 0 }} /></tr>
          {cats.map((cat) => (
            <Row key={cat} label={cat.toUpperCase()} values={income.expenses_by_cat[cat]} />
          ))}
          <tr><td colSpan={income.months.length + 1} style={{ borderTop: "1px solid var(--line-2)", padding: 0 }} /></tr>
          <Row label="TOTAL EXPENSES" values={income.total_expenses} accent="var(--neon-magenta)" bold />
          <Row
            label="NET"
            values={income.net}
            accent={income.net.some((n) => n < 0) ? "var(--sem-down)" : "var(--sem-up)"}
            bold
          />
        </tbody>
      </table>
    </div>
  );
}

function CashView({ cash }: { cash: NvCashMovementTrend | null }) {
  if (!cash) {
    return <div style={{ padding: 24, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-4)" }}>Loading…</div>;
  }
  return (
    <div style={{ padding: "16px 0" }}>
      <DualAreaChart
        inflow={cash.inflow}
        outflow={cash.outflow}
        net30d={cash.net_30d}
        in30d={cash.in_30d}
        out30d={cash.out_30d}
        axisLabels={cash.axis_labels}
      />
    </div>
  );
}

function BalanceRow({ label, value, status, unavailableReason, color, indent, bold }: {
  label: string;
  value: number | null;
  status?: "live" | "unavailable";
  unavailableReason?: string | null;
  color?: string;
  indent?: boolean;
  bold?: boolean;
}) {
  const unavailable = status === "unavailable" || value === null;
  return (
    <div
      title={unavailable && unavailableReason ? unavailableReason.replace(/_/g, " ") : undefined}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        padding: `${indent ? 5 : 8}px 0`,
        paddingLeft: indent ? 16 : 0,
      }}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: indent ? 11 : 12, color: "var(--fg-2)", fontWeight: bold ? 600 : undefined }}>
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: indent ? 11 : 13,
          fontVariantNumeric: "tabular-nums",
          color: unavailable ? "var(--fg-4)" : (color ?? "var(--fg-1)"),
          fontWeight: bold ? 600 : undefined,
        }}
      >
        {unavailable ? "—" : fmtUSD(value!)}
      </span>
    </div>
  );
}

function BalanceView({ balance }: { balance: NvBalanceSnapshot | null }) {
  if (!balance) {
    return <div style={{ padding: 24, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-4)" }}>Loading…</div>;
  }
  const sectionHeader = (title: string, color: string) => (
    <div style={{
      fontFamily: "var(--font-mono)",
      fontSize: 9,
      letterSpacing: ".12em",
      textTransform: "uppercase",
      color,
      padding: "14px 0 4px",
      borderBottom: "1px solid var(--line-2)",
      marginBottom: 4,
    }}>{title}</div>
  );
  return (
    <div style={{ maxWidth: 420, padding: "8px 0 16px" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-4)", marginBottom: 12 }}>
        AS OF {balance.as_of}
      </div>
      {sectionHeader("ASSETS", "var(--sem-up)")}
      <BalanceRow label="Cash" value={balance.assets.cash} status={balance.assets.cash_status as "live" | "unavailable"} unavailableReason={balance.assets.cash_unavailable_reason} indent />
      <BalanceRow label="Receivables" value={balance.assets.receivables} color="var(--neon-amber)" indent />
      <BalanceRow label="Total Assets" value={balance.assets.total} color="var(--sem-up)" bold />

      {sectionHeader("LIABILITIES", "var(--sem-down)")}
      <BalanceRow label="Payables" value={balance.liabilities.payables} indent />
      <BalanceRow label="Total Liabilities" value={balance.liabilities.total} color="var(--sem-down)" bold />

      {sectionHeader("EQUITY", "var(--neon-cyan)")}
      <BalanceRow
        label="Equity"
        value={balance.equity}
        color={balance.equity >= 0 ? "var(--sem-up)" : "var(--sem-down)"}
        bold
      />
    </div>
  );
}

export function StatementsView({ income, cash, balance }: Props) {
  const [sub, setSub] = useState<SubView>("income");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Segmented control */}
      <div style={{ display: "flex", gap: 0, padding: "12px 0 0", borderBottom: "1px solid var(--line-2)", marginBottom: 16 }}>
        {(["income", "cash", "balance"] as SubView[]).map((key, i) => {
          const active = sub === key;
          const labels: Record<SubView, string> = { income: "Income", cash: "Cash Flow", balance: "Balance" };
          return (
            <button
              key={key}
              onClick={() => setSub(key)}
              style={{
                ...SEG_STYLES.base,
                ...(active ? SEG_STYLES.active : {}),
                borderRadius: i === 0 ? "2px 0 0 2px" : i === 2 ? "0 2px 2px 0" : 0,
                marginLeft: i > 0 ? -1 : 0,
              }}
            >
              {labels[key]}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {sub === "income" && <IncomeView income={income} />}
        {sub === "cash" && <CashView cash={cash} />}
        {sub === "balance" && <BalanceView balance={balance} />}
      </div>
    </div>
  );
}
