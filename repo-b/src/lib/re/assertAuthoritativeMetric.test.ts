import { describe, expect, it } from "vitest";
import {
  assertAuthoritativeMetric,
  renderAuthoritativeMetric,
  AuthoritativeMetricContractError,
  type AuthoritativeStateLike,
} from "./assertAuthoritativeMetric";

const RELEASED_STATE: AuthoritativeStateLike = {
  state_origin: "authoritative",
  promotion_state: "released",
  period_exact: true,
  null_reason: null,
  null_reasons: {},
  state: {
    canonical_metrics: {
      ending_nav: "44274560.576",
      gross_irr: "0.1348",
      net_irr: null,
      dpi: "0.25",
      tvpi: "1.45",
    },
  },
};

describe("assertAuthoritativeMetric", () => {
  it("allows a metric from a released authoritative state", () => {
    const result = assertAuthoritativeMetric(RELEASED_STATE, { field: "gross_irr" });
    expect(result.kind).toBe("allowed");
    if (result.kind === "allowed") {
      expect(result.value).toBe("0.1348");
    }
  });

  it("rejects null state", () => {
    expect(() =>
      assertAuthoritativeMetric(null, { field: "gross_irr" })
    ).toThrow(AuthoritativeMetricContractError);
  });

  it("rejects non-authoritative origin", () => {
    const state: AuthoritativeStateLike = { ...RELEASED_STATE, state_origin: "derived" };
    expect(() =>
      assertAuthoritativeMetric(state, { field: "gross_irr" })
    ).toThrow(AuthoritativeMetricContractError);
  });

  it("rejects period drift", () => {
    const state: AuthoritativeStateLike = { ...RELEASED_STATE, period_exact: false };
    expect(() =>
      assertAuthoritativeMetric(state, { field: "gross_irr" })
    ).toThrow(AuthoritativeMetricContractError);
  });

  it("returns unavailable when promotion_state is not released", () => {
    const state: AuthoritativeStateLike = { ...RELEASED_STATE, promotion_state: "verified" };
    const result = assertAuthoritativeMetric(state, { field: "gross_irr" });
    expect(result).toEqual({ kind: "unavailable", nullReason: "authoritative_state_not_released" });
  });

  it("returns unavailable when top-level null_reason is set", () => {
    const state: AuthoritativeStateLike = { ...RELEASED_STATE, null_reason: "incomplete_cash_flow_series" };
    const result = assertAuthoritativeMetric(state, { field: "gross_irr" });
    expect(result).toEqual({ kind: "unavailable", nullReason: "incomplete_cash_flow_series" });
  });

  it("returns unavailable when field-level null_reason is set", () => {
    const state: AuthoritativeStateLike = {
      ...RELEASED_STATE,
      null_reasons: { net_irr: "out_of_scope_requires_waterfall" },
    };
    const result = assertAuthoritativeMetric(state, { field: "net_irr" });
    expect(result).toEqual({ kind: "unavailable", nullReason: "out_of_scope_requires_waterfall" });
  });

  it("allows a different field when only one field has a null_reason", () => {
    const state: AuthoritativeStateLike = {
      ...RELEASED_STATE,
      null_reasons: { net_irr: "out_of_scope_requires_waterfall" },
    };
    const result = assertAuthoritativeMetric(state, { field: "gross_irr" });
    expect(result.kind).toBe("allowed");
  });

  it("returns unavailable when the metric value itself is null", () => {
    const result = assertAuthoritativeMetric(RELEASED_STATE, { field: "net_irr" });
    expect(result).toEqual({ kind: "unavailable", nullReason: "missing:net_irr" });
  });

  it("returns unavailable when the metric key does not exist", () => {
    const result = assertAuthoritativeMetric(RELEASED_STATE, { field: "nonexistent_field" });
    expect(result).toEqual({ kind: "unavailable", nullReason: "missing:nonexistent_field" });
  });
});

describe("renderAuthoritativeMetric", () => {
  it("formats a valid metric value", () => {
    const cell = renderAuthoritativeMetric(RELEASED_STATE, "gross_irr", (v) => `${(Number(v) * 100).toFixed(1)}%`);
    expect(cell).toEqual({ kind: "value", value: "13.5%" });
  });

  it("returns unavailable for unreleased state", () => {
    const state: AuthoritativeStateLike = { ...RELEASED_STATE, promotion_state: "verified" };
    const cell = renderAuthoritativeMetric(state, "gross_irr", (v) => String(v));
    expect(cell).toEqual({ kind: "unavailable", nullReason: "authoritative_state_not_released" });
  });

  it("returns unavailable for null metric value", () => {
    const cell = renderAuthoritativeMetric(RELEASED_STATE, "net_irr", (v) => String(v));
    expect(cell).toEqual({ kind: "unavailable", nullReason: "missing:net_irr" });
  });

  it("throws in dev when formatter crashes on bad input", () => {
    const badState: AuthoritativeStateLike = {
      ...RELEASED_STATE,
      state: { canonical_metrics: { gross_irr: "not_a_number" } },
    };
    expect(() =>
      renderAuthoritativeMetric(badState, "gross_irr", (v) => {
        const n = Number(v);
        if (isNaN(n)) throw new Error("bad number");
        return String(n);
      })
    ).toThrow(AuthoritativeMetricContractError);
  });
});
