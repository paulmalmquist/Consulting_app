"use client";

import type { Position } from "@/lib/historyrhymes/client";
import { C, Tag } from "./primitives";

// Zone 7 — implication card. Same Position data model as the legacy
// DecisionCard, reframed copy: this is regime interpretation ("directional
// bias", "implication"), not a retail trading signal. Tier values stay
// act/watch/research on the wire; the labels users read do not say ACT.

export interface ImplicationCardProps {
  position: Position;
  tier?: "act" | "watch" | "research";
}

const TIER_LABEL: Record<NonNullable<ImplicationCardProps["tier"]>, { label: string; color: string }> = {
  act: { label: "Implication", color: C.amber },
  watch: { label: "Watch item", color: C.cyan },
  research: { label: "Research item", color: C.dim },
};

const DIRECTION_COLOR: Record<Position["direction"], string> = {
  long: C.green, short: C.red, neutral: C.dim,
};

export function ImplicationCard({ position, tier = "act" }: ImplicationCardProps) {
  const tierInfo = TIER_LABEL[tier];
  const dirColor = DIRECTION_COLOR[position.direction];

  return (
    <article data-testid="hr-implication-card" data-tier={tier}
      style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Tag color={tierInfo.color}>{tierInfo.label}</Tag>
          <span style={{ fontFamily: C.sans, fontSize: 17, fontWeight: 600, color: C.text }}>{position.asset}</span>
        </div>
        <span data-testid="hr-directional-bias" title="directional bias"
          style={{ fontFamily: C.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em",
            color: dirColor, background: dirColor + "14", border: `1px solid ${dirColor}38`, borderRadius: 5, padding: "2px 7px", flexShrink: 0 }}>
          bias: {position.direction}
        </span>
      </div>

      <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, margin: "0 0 12px" }}>
        {[
          { dt: "Model exposure", dd: `${(position.size * 100).toFixed(0)}%` },
          { dt: "Horizon", dd: `${position.time_horizon_days}d` },
          { dt: "Entry posture", dd: position.entry_type },
        ].map((f) => (
          <div key={f.dt}>
            <dt style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.1em", color: C.faint, textTransform: "uppercase" }}>{f.dt}</dt>
            <dd style={{ fontFamily: C.mono, fontSize: 13, color: C.text, margin: "3px 0 0", textTransform: f.dt === "Entry posture" ? "capitalize" : "none" }}>{f.dd}</dd>
          </div>
        ))}
      </dl>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.1em", color: C.faint, textTransform: "uppercase", marginBottom: 4 }}>
          Invalidation
        </div>
        <div style={{ fontFamily: C.sans, fontSize: 13, color: C.text, lineHeight: 1.45 }}>{position.invalidation}</div>
      </div>

      {position.top_analog && position.top_analog !== "none" && (
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>
          top analog: <span style={{ color: C.accent }}>{position.top_analog}</span> (rhyme {position.rhyme_score.toFixed(2)})
        </div>
      )}

      {position.key_drivers.length > 0 && (
        <ul style={{ display: "flex", flexWrap: "wrap", gap: 5, margin: "10px 0 0", padding: 0, listStyle: "none" }}>
          {position.key_drivers.map((d, i) => (
            <li key={i} style={{ fontFamily: C.mono, fontSize: 10, padding: "2px 7px", borderRadius: 5,
              background: C.panelHi, color: C.dim, border: `1px solid ${C.border}` }}>
              {d}
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: 11, color: C.faint }}>
        Next check: {position.next_check}
      </div>
    </article>
  );
}
