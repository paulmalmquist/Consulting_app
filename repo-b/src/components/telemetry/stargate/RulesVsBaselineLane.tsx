"use client";

// Rules vs baseline — the current per-printer state of the hard two-condition rule beside the
// rolling-MAD baseline scorer. The point of the panel: the rule needs BOTH a cold melt pool AND a
// shaking arm together; the single-channel baseline can flag a melt-pool temperature residual while
// vibration is still below the rule threshold, so it can lead the rule on a temperature-only excursion.
// The baseline is a rolling-MAD residual, NOT an LSTM — labeled as such everywhere.

import { C, EmptyState, Panel, Tag, verdictColor } from "../primitives";
import type { ScoredRow } from "@/lib/lab/stargateStream";

function scoreText(s: ScoredRow["scorer"]): string {
  if (s.model_not_configured || s.score === null) {
    return `Not available — ${s.null_reason ?? "model_not_configured"}`;
  }
  return `${s.verdict} · score ${s.score.toFixed(2)}`;
}

// The baseline leads the rule when it is past GO while the two-condition rule has not fired.
function baselineLeads(row: ScoredRow): boolean {
  return !row.rule.fired
    && !row.scorer.model_not_configured
    && (row.scorer.verdict === "REVIEW" || row.scorer.verdict === "NO_GO");
}

function LaneRow({ row }: { row: ScoredRow }) {
  const ruleColor = row.rule.fired ? C.red : C.green;
  const scorerNull = row.scorer.model_not_configured || row.scorer.score === null;
  const scorerColor = scorerNull ? C.faint : verdictColor(row.scorer.verdict);
  const leads = baselineLeads(row);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(120px, 0.9fr) 1fr 1fr",
        gap: 12,
        alignItems: "center",
        padding: "10px 12px",
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>
        {row.printer_id}
        {leads && (
          <div style={{ marginTop: 5 }}>
            <Tag color={C.amber}>baseline ahead of rule</Tag>
          </div>
        )}
      </div>

      <div>
        <div style={{ fontFamily: C.mono, fontSize: 9, color: C.faint, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Rule
        </div>
        <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 8 }}>
          <Tag color={ruleColor}>{row.rule.fired ? "routed" : "clear"}</Tag>
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>
            {row.rule.temp_c.toFixed(0)}°C · {row.rule.vib_g.toFixed(3)}g
          </span>
        </div>
      </div>

      <div>
        <div style={{ fontFamily: C.mono, fontSize: 9, color: C.faint, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Baseline scorer
        </div>
        <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 8 }}>
          <Tag color={scorerColor}>{scorerNull ? "n/a" : row.scorer.verdict}</Tag>
          <span style={{ fontFamily: C.mono, fontSize: 10, color: scorerNull ? C.faint : C.dim }}>
            {scoreText(row.scorer)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function RulesVsBaselineLane({ scored }: { scored: ScoredRow[] }) {
  const sorted = [...scored].sort((a, b) => a.printer_id.localeCompare(b.printer_id));
  return (
    <Panel
      title="Rules vs baseline"
      pad={0}
      right={<Tag color={C.cyan}>baseline scorer (rolling-MAD residual) · not LSTM</Tag>}
    >
      {sorted.length === 0 ? (
        <EmptyState
          label="No scored printers yet."
          hint="The baseline scorer needs a short window of readings before it reports a verdict."
        />
      ) : (
        <>
          {sorted.map((row) => (
            <LaneRow key={row.printer_id} row={row} />
          ))}
          <div style={{ padding: "12px 12px 14px", fontFamily: C.mono, fontSize: 10, color: C.faint, lineHeight: 1.6 }}>
            The hard rule is a cold melt pool (&lt;1400°C) AND high arm vibration (&gt;0.08g), together.
            When the baseline runs ahead: the baseline scorer flagged an early melt-pool temperature
            residual while vibration was still below the rule threshold. The hard two-condition rule
            routed the anomaly later, when cold melt-pool and high arm vibration co-occurred.
          </div>
        </>
      )}
    </Panel>
  );
}
