import { describe, it, expect } from "vitest";
import {
  signalEvidence,
  analogEvidence,
  alertEvidence,
  scenarioEvidence,
  regimeEvidence,
  briefEvidence,
} from "./evidence";
import { parseBriefSignals } from "./signals";
import { makeMatch } from "./rhymesFixtures";
import type { HrBrief, HrState } from "./client";

const BRIEF = {
  brief_id: "b1",
  published_at: "2026-06-10T08:00:00Z",
  regime_call: "late_cycle",
  confidence: 0.6,
  freshness_score: 0.9,
  markdown_uri: "/briefs/latest.md",
  parsed_json: { latest_signals: { mvrv_z: 2.31 } },
  source: "weekly",
  created_at: "2026-06-10T08:00:00Z",
} as HrBrief;

function fieldByLabel(payload: { fields: { label: string; value: string | null; nullReason?: string }[] }, label: string) {
  const f = payload.fields.find((x) => x.label === label);
  if (!f) throw new Error(`no field ${label}`);
  return f;
}

describe("evidence builders", () => {
  it("every null field carries a nullReason (signal evidence on a missing key)", () => {
    const missing = parseBriefSignals(BRIEF).find((s) => s.key === "housing")!;
    const payload = signalEvidence(missing, BRIEF);
    expect(payload.kind).toBe("signal");
    for (const f of payload.fields) {
      if (f.value === null) expect(f.nullReason).toBeTruthy();
    }
    expect(fieldByLabel(payload, "value").nullReason).toBe("not present in latest brief");
  });

  it("analog evidence carries the match request_id and explains the null dtw", () => {
    const match = makeMatch();
    const payload = analogEvidence(match.top_analogs[0], match);
    expect(payload.requestId).toBe("req_abc123def456");
    const dtw = fieldByLabel(payload, "dtw");
    expect(dtw.value).toBeNull();
    expect(dtw.nullReason).toContain("v1");
    expect(fieldByLabel(payload, "rhyme score").value).toBe("0.8731");
  });

  it("scenario evidence withholds placeholder probabilities with a reason", () => {
    const match = makeMatch();
    const payload = scenarioEvidence(match.scenarios, match.confidence_meta, match.request_id, true);
    expect(fieldByLabel(payload, "bull").value).toBeNull();
    expect(fieldByLabel(payload, "bull").nullReason).toContain("placeholder");
    expect(fieldByLabel(payload, "agent agreement").nullReason).toBe("not yet computed (v1)");
    // Real values render.
    const live = scenarioEvidence(
      { bull: { probability: 0.2, narrative: "x" }, base: { probability: 0.5, narrative: "y" }, bear: { probability: 0.3, narrative: "z" } },
      match.confidence_meta, match.request_id, false,
    );
    expect(fieldByLabel(live, "bull").value).toBe("20%");
  });

  it("regime evidence renders the 9999 sentinel honestly and reasons all-null inputs", () => {
    const payload = regimeEvidence(null, null, null);
    expect(fieldByLabel(payload, "regime").nullReason).toBe("no decision or brief on record");
    const withSentinel = regimeEvidence(
      { worst_input_age_hours: 9999, freshness_verdict: "no_brief" } as HrState, null, null,
    );
    expect(fieldByLabel(withSentinel, "worst input age (h)").value).toBe("no inputs on record");
  });

  it("alert and brief evidence reason their absent fields", () => {
    const alert = alertEvidence({
      id: "al-1", alert_type: "era_mismatch", severity: "info", hoyt_position: null,
      trigger_signals: {}, narrative: null, alert_date: "2026-06-11",
    });
    expect(fieldByLabel(alert, "narrative").nullReason).toContain("without a narrative");
    expect(fieldByLabel(alert, "hoyt position").nullReason).toContain("not a hoyt-cycle alert");

    const noBrief = briefEvidence(null);
    for (const f of noBrief.fields) expect(f.value).toBeNull();
    expect(fieldByLabel(noBrief, "published").nullReason).toBe("no weekly brief on record");
  });
});
