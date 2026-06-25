import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import RulesVsBaselineLane from "./RulesVsBaselineLane";
import type { BaselineScorer, ScoredRow } from "@/lib/lab/stargateStream";

const scorer = (over: Partial<BaselineScorer> = {}): BaselineScorer => ({
  name: "baseline scorer (rolling-MAD residual)",
  version: "mad-k4.0-gscale0.0339",
  score: 0.12,
  verdict: "GO",
  threshold: 0.135,
  model_not_configured: false,
  null_reason: null,
  ...over,
});

const row = (over: Partial<ScoredRow> = {}): ScoredRow => ({
  printer_id: "stargate-v4-01",
  ts_us: 1,
  rule: { fired: false, predicate: "cold melt pool (<1400°C) AND high arm vibration (>0.08g)", temp_c: 1500, vib_g: 0.02 },
  scorer: scorer(),
  feature_window: {},
  ...over,
});

describe("RulesVsBaselineLane", () => {
  it("labels the scorer as a rolling-MAD baseline with the honest not-LSTM disclaimer", () => {
    render(<RulesVsBaselineLane scored={[row()]} />);
    expect(
      screen.getByText(/baseline scorer \(rolling-MAD residual\) · not LSTM/i),
    ).toBeInTheDocument();
  });

  it("shows 'Not available — <null_reason>' and never a number when the scorer is unconfigured", () => {
    render(
      <RulesVsBaselineLane
        scored={[row({ scorer: scorer({ score: null, verdict: null, model_not_configured: true, null_reason: "insufficient_window" }) })]}
      />,
    );
    expect(screen.getByText(/Not available — insufficient_window/i)).toBeInTheDocument();
  });

  it("flags 'baseline ahead of rule' (with the honest wording) when baseline is REVIEW and the rule is clear", () => {
    render(
      <RulesVsBaselineLane
        scored={[row({
          rule: { fired: false, predicate: "cold melt pool …", temp_c: 1500, vib_g: 0.02 },
          scorer: scorer({ score: 1.48, verdict: "REVIEW" }),
        })]}
      />,
    );
    expect(screen.getByText(/baseline ahead of rule/i)).toBeInTheDocument();
    expect(screen.getByText(/vibration was still below the rule threshold/i)).toBeInTheDocument();
  });

  it("uses cold-melt-pool wording, never 'high temp'", () => {
    render(<RulesVsBaselineLane scored={[row()]} />);
    expect(screen.getByText(/cold melt pool \(<1400°C\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/high temp/i)).toBeNull();
  });
});
