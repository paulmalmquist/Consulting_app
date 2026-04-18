"use client";
import { Dot } from "../atoms/Dot";
import { fmtUSDK } from "../atoms/format";

type DualAreaChartProps = {
  inflow: number[];
  outflow: number[];
  net30d: number;
  in30d: number;
  out30d: number;
  axisLabels: string[]; // 3 labels spread across the x-axis
};

export function DualAreaChart({ inflow, outflow, net30d, in30d, out30d, axisLabels }: DualAreaChartProps) {
  const max = Math.max(...inflow, ...outflow, 1);
  const toPath = (points: number[]) => {
    const step = 100 / (points.length - 1 || 1);
    const coords = points.map((v, i) => `${i * step},${100 - (v / max) * 90 - 2}`);
    return `M0,100 L${coords.join(" L")} L100,100 Z`;
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 14,
            color: net30d >= 0 ? "var(--sem-up)" : "var(--sem-down)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          NET {fmtUSDK(net30d)}
        </span>
        <div
          style={{
            display: "flex",
            gap: 10,
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--fg-3)",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Dot color="var(--sem-up)" size={4} />
            IN {fmtUSDK(in30d)}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Dot color="var(--neon-magenta)" size={4} />
            OUT {fmtUSDK(out30d)}
          </span>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 50, position: "relative" }}>
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ display: "block" }}
        >
          <defs>
            <linearGradient id="cd-cash-in" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--sem-up)" stopOpacity=".4" />
              <stop offset="1" stopColor="var(--sem-up)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="cd-cash-out" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--neon-magenta)" stopOpacity=".4" />
              <stop offset="1" stopColor="var(--neon-magenta)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="0" y1="25" x2="100" y2="25" stroke="var(--line-2)" strokeDasharray="1 2" strokeWidth="0.3" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="var(--line-2)" strokeDasharray="1 2" strokeWidth="0.3" />
          <line x1="0" y1="75" x2="100" y2="75" stroke="var(--line-2)" strokeDasharray="1 2" strokeWidth="0.3" />
          <path d={toPath(inflow)} fill="url(#cd-cash-in)" stroke="var(--sem-up)" strokeWidth="0.6" />
          <path d={toPath(outflow)} fill="url(#cd-cash-out)" stroke="var(--neon-magenta)" strokeWidth="0.6" />
        </svg>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--fg-3)",
          letterSpacing: ".04em",
        }}
      >
        {axisLabels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </div>
  );
}
