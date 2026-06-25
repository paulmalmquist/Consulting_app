import { describe, expect, it } from "vitest";
import { lookupFeature } from "./factoryFeatureCatalog";

describe("factoryFeatureCatalog", () => {
  it("decomposes a windowed telemetry feature into an inferred def + units-unknown marker", () => {
    const def = lookupFeature("temperature_p2p_drift_max");
    expect(def).not.toBeNull();
    expect(def!.inferred).toBe(true);
    expect(def!.signal).toMatch(/temperature/i);
    expect(def!.definition).toMatch(/peak-to-peak drift/i);
    expect(def!.units).toMatch(/units unknown/i);
  });

  it("handles std_mean and slope_mean suffixes", () => {
    expect(lookupFeature("flow_rate_std_mean")!.definition).toMatch(/standard deviation/i);
    expect(lookupFeature("temperature_slope_mean")!.definition).toMatch(/slope/i);
  });

  it("treats part_family_* as a one-hot indicator with a 0/1 unit", () => {
    const def = lookupFeature("part_family_AVI-HARNESS");
    expect(def!.statistic).toBe("one_hot");
    expect(def!.definition).toMatch(/AVI-HARNESS/);
    expect(def!.units).toMatch(/indicator/i);
  });

  it("describes limit_violation_count as a count", () => {
    const def = lookupFeature("limit_violation_count");
    expect(def!.statistic).toBe("count");
    expect(def!.units).toBe("count");
  });

  it("returns null for an unknown name (fail closed)", () => {
    expect(lookupFeature("totally_unknown_feature_xyz")).toBeNull();
    expect(lookupFeature("")).toBeNull();
  });
});
