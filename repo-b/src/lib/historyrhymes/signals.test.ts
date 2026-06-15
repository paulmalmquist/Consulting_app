import { describe, it, expect } from "vitest";
import {
  SIGNAL_KEYS,
  formatSignalValue,
  computeDelta,
  freshnessToStatus,
  parseBriefSignals,
} from "./signals";
import type { HrBrief } from "./client";

function briefWith(parsed: Record<string, unknown>): HrBrief {
  return {
    brief_id: "b1",
    published_at: "2026-06-10T08:00:00Z",
    regime_call: "late_cycle",
    confidence: 0.6,
    freshness_score: 0.9,
    markdown_uri: null,
    parsed_json: parsed,
    source: "weekly",
    created_at: "2026-06-10T08:00:00Z",
  } as HrBrief;
}

describe("formatSignalValue (ported PulseStrip edge cases)", () => {
  it("handles null/undefined as em dash", () => {
    expect(formatSignalValue(null)).toBe("—");
    expect(formatSignalValue(undefined)).toBe("—");
  });
  it("formats integers bare and floats to 2dp", () => {
    expect(formatSignalValue(3)).toBe("3");
    expect(formatSignalValue(1.456)).toBe("1.46");
  });
  it("passes strings through and extracts housing price_yoy from objects", () => {
    expect(formatSignalValue("hawkish")).toBe("hawkish");
    expect(formatSignalValue({ price_yoy: 4.27 })).toBe("4.3% YoY");
  });
  it("truncates unknown objects instead of crashing", () => {
    expect(formatSignalValue({ a: 1, b: 2 })).toBe('{"a":1,"b":2}'.slice(0, 16));
  });
});

describe("computeDelta", () => {
  it("returns signed deltas for number pairs", () => {
    expect(computeDelta(0.53, 0.47)).toBe("+0.06");
    expect(computeDelta(0.4, 0.47)).toBe("-0.07");
    expect(computeDelta(0.47, 0.47)).toBe("±0");
  });
  it("returns null when either side is not a number", () => {
    expect(computeDelta("hawkish", 1)).toBeNull();
    expect(computeDelta(1, undefined)).toBeNull();
    expect(computeDelta({ price_yoy: 1 }, 2)).toBeNull();
  });
});

describe("freshnessToStatus", () => {
  it("maps fresh/0d/1d to fresh, older labels to stale, no value to missing", () => {
    expect(freshnessToStatus("fresh", true)).toBe("fresh");
    expect(freshnessToStatus("1d", true)).toBe("fresh");
    expect(freshnessToStatus("3d", true)).toBe("stale");
    expect(freshnessToStatus("stale", true)).toBe("stale");
    expect(freshnessToStatus(null, false)).toBe("missing");
    expect(freshnessToStatus("fresh", false)).toBe("missing");
  });
});

describe("parseBriefSignals", () => {
  it("always returns all eight keys in contract order", () => {
    const out = parseBriefSignals(null);
    expect(out.map((s) => s.key)).toEqual(SIGNAL_KEYS.map((k) => k.key));
  });

  it("null brief yields eight missing tiles with the no-brief reason", () => {
    for (const s of parseBriefSignals(null)) {
      expect(s.status).toBe("missing");
      expect(s.formatted).toBe("—");
      expect(s.nullReason).toBe("no weekly brief on record");
      expect(s.source).toBe("brief");
    }
  });

  it("brief without latest_signals yields explicit malformed reason, no crash", () => {
    const out = parseBriefSignals(briefWith({ something_else: true }));
    for (const s of out) {
      expect(s.status).toBe("missing");
      expect(s.nullReason).toBe("brief has no latest_signals");
    }
  });

  it("malformed latest_signals (array instead of object) fails closed", () => {
    const out = parseBriefSignals(briefWith({ latest_signals: [1, 2, 3] }));
    for (const s of out) expect(s.status).toBe("missing");
  });

  it("parses values, deltas, and per-signal freshness; absent keys stay missing", () => {
    const out = parseBriefSignals(
      briefWith({
        latest_signals: {
          mvrv_z: 2.31,
          yc_10y2y: 0.53,
          fed_tone: "hawkish",
          housing: { price_yoy: 4.2 },
          per_signal_freshness: { mvrv_z: "fresh", yc_10y2y: "3d" },
        },
        previous_signals: { yc_10y2y: 0.47 },
      }),
    );
    const byKey = Object.fromEntries(out.map((s) => [s.key, s]));
    expect(byKey.mvrv_z.formatted).toBe("2.31");
    expect(byKey.mvrv_z.status).toBe("fresh");
    expect(byKey.yc_10y2y.delta).toBe("+0.06");
    expect(byKey.yc_10y2y.status).toBe("stale");
    expect(byKey.fed_tone.formatted).toBe("hawkish");
    expect(byKey.fed_tone.delta).toBeNull();
    expect(byKey.housing.formatted).toBe("4.2% YoY");
    expect(byKey.cmbs_delinq.status).toBe("missing");
    expect(byKey.cmbs_delinq.nullReason).toBe("not present in latest brief");
    // A value with no freshness label is shown but not invented to be stale.
    expect(byKey.fed_tone.status).toBe("fresh");
  });
});
