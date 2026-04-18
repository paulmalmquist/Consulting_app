"use client";
import { Sparkline } from "../atoms/Sparkline";

export type KPITile = {
  key: string;
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "up" | "down" | "neutral" | "warn";
  source?: string;
  accent: string;
  sparkline?: number[];
  sparkColor?: string;
};

type KPIBarProps = {
  tiles: KPITile[];
  activeKey?: string | null;
  onSelect?: (key: string | null) => void;
};

function deltaColor(tone?: KPITile["deltaTone"]): string {
  if (tone === "up") return "var(--sem-up)";
  if (tone === "down") return "var(--sem-down)";
  if (tone === "warn") return "var(--neon-amber)";
  return "var(--fg-3)";
}

export function KPIBar({ tiles, activeKey, onSelect }: KPIBarProps) {
  return (
    <div
      style={{
        background: "var(--bg-base)",
        borderBottom: "1px solid var(--line-2)",
        padding: "10px 16px",
        display: "grid",
        gridTemplateColumns: `repeat(${tiles.length}, 1fr)`,
        gap: 8,
      }}
    >
      {tiles.map((t) => {
        const active = activeKey === t.key;
        return (
          <button
            type="button"
            key={t.key}
            onClick={() => onSelect?.(active ? null : t.key)}
            style={{
              position: "relative",
              textAlign: "left",
              background: active ? "var(--bg-panel-2)" : "var(--bg-panel)",
              border: `1px solid ${active ? t.accent : "var(--line-2)"}`,
              borderRadius: 3,
              padding: "10px 12px 8px",
              cursor: "pointer",
              color: "var(--fg-1)",
              boxShadow: active
                ? `0 0 0 1px ${t.accent}33, inset 0 0 40px rgba(0,0,0,.3)`
                : "none",
              transition: "all 80ms",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 2,
                background: `linear-gradient(90deg, ${t.accent}, transparent)`,
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  color: active ? t.accent : "var(--fg-3)",
                }}
              >
                {t.label}
              </span>
              {active && (
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    letterSpacing: ".1em",
                    color: t.accent,
                  }}
                >
                  ● FILTERED
                </span>
              )}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 22,
                fontWeight: 500,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.02em",
                color: "var(--fg-1)",
                lineHeight: 1.1,
              }}
            >
              {t.value}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginTop: 2,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: ".04em",
              }}
            >
              <span style={{ color: deltaColor(t.deltaTone) }}>{t.delta ?? ""}</span>
              {t.source && <span style={{ color: "var(--fg-3)" }}>{t.source}</span>}
            </div>
            {t.sparkline && t.sparkline.length > 1 && (
              <div style={{ height: 18, marginTop: 4 }}>
                <Sparkline
                  points={t.sparkline}
                  color={t.sparkColor ?? t.accent}
                  height={18}
                  strokeWidth={1}
                />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
