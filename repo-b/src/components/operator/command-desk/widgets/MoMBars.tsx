"use client";
import { fmtUSDK, fmtPct } from "../atoms/format";

export type MoMBar = {
  label: string;
  amount: number;
};

type MoMBarsProps = {
  months: MoMBar[];
  momPct: number;
  summary?: string;
};

export function MoMBars({ months, momPct, summary }: MoMBarsProps) {
  const max = Math.max(...months.map((m) => m.amount), 1);
  const latest = months[months.length - 1];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 20,
            color: "var(--fg-1)",
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.02em",
          }}
        >
          {fmtUSDK(latest?.amount ?? 0)}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: momPct >= 0 ? "var(--sem-up)" : "var(--sem-down)",
          }}
        >
          {fmtPct(momPct)} MoM
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flex: 1, minHeight: 40 }}>
        {months.map((m, i) => {
          const h = (m.amount / max) * 100;
          const current = i === months.length - 1;
          return (
            <div
              key={m.label}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
            >
              <div
                style={{
                  width: "100%",
                  height: `${h}%`,
                  background: current ? "var(--neon-violet)" : "var(--line-3)",
                  boxShadow: current ? "0 0 10px rgba(176,124,255,.45)" : "none",
                  borderRadius: 1,
                  minHeight: 2,
                }}
              />
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: current ? "var(--neon-violet)" : "var(--fg-3)",
                  letterSpacing: ".08em",
                }}
              >
                {m.label}
              </span>
            </div>
          );
        })}
      </div>
      {summary && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--fg-3)" }}>
          {summary}
        </span>
      )}
    </div>
  );
}
