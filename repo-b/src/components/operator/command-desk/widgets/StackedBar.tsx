"use client";
import { fmtUSDK } from "../atoms/format";

export type StackedBarSlice = {
  key: string;
  label: string;
  amount: number;
  color: string;
};

type StackedBarProps = {
  slices: StackedBarSlice[];
  total: number;
};

export function StackedBar({ slices, total }: StackedBarProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          height: 10,
          width: "100%",
          borderRadius: 2,
          overflow: "hidden",
          display: "flex",
          background: "var(--bg-inset)",
          border: "1px solid var(--line-2)",
        }}
      >
        {slices.map((s) => {
          const pct = total > 0 ? (s.amount / total) * 100 : 0;
          return (
            <div
              key={s.key}
              title={`${s.label} · ${fmtUSDK(s.amount)}`}
              style={{ width: `${pct}%`, background: s.color }}
            />
          );
        })}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "4px 12px",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--fg-2)",
        }}
      >
        {slices.map((s) => {
          const pct = total > 0 ? (s.amount / total) * 100 : 0;
          return (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span
                style={{ width: 8, height: 8, background: s.color, flex: "none", borderRadius: 1 }}
              />
              <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {s.label}
              </span>
              <span style={{ color: "var(--fg-1)", fontVariantNumeric: "tabular-nums" }}>
                {fmtUSDK(s.amount)}
              </span>
              <span style={{ color: "var(--fg-3)", fontVariantNumeric: "tabular-nums" }}>
                {pct.toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
