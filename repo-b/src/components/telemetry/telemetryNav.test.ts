import {
  TELEMETRY_NAV,
  TELEMETRY_NAV_GROUPS,
  isTelemetryItemActive,
  telemetryHref,
} from "./telemetryNav";

describe("telemetry navigation structure (6-section redesign)", () => {
  it("exposes exactly the six redesign sections in order", () => {
    expect(TELEMETRY_NAV_GROUPS).toEqual([
      "Overview",
      "Operations",
      "Models & Intelligence",
      "Factory & Quality",
      "Evidence & Lineage",
      "Agent Operations",
    ]);
  });

  it("assigns every nav item to one of the six declared groups", () => {
    for (const item of TELEMETRY_NAV) {
      expect(TELEMETRY_NAV_GROUPS).toContain(item.group);
    }
  });

  it("keeps every existing surface routable (regression guard — no slug dropped)", () => {
    const slugs = TELEMETRY_NAV.map((n) => n.slug).sort();
    expect(slugs).toEqual(
      [
        "",
        "calibration",
        "control-tower",
        "copilot",
        "factory",
        "factory-ml",
        "governance",
        "how-it-works",
        "metadata",
        "metric-lineage",
        "model-performance",
        "registry",
        "replay",
        "runs",
        "stargate",
        "stream",
        "system-health",
      ].sort(),
    );
  });

  it("applies the redesign relabels without changing slugs", () => {
    const labelOf = (slug: string) => TELEMETRY_NAV.find((n) => n.slug === slug)?.label;
    expect(labelOf("")).toBe("Overview");
    expect(labelOf("governance")).toBe("Trust Center");
    expect(labelOf("control-tower")).toBe("Agent Control Tower");
    expect(labelOf("factory-ml")).toBe("Flight Readiness");
  });

  it("groups Metadata Explorer under Evidence & Lineage without expanding mobile primary tabs", () => {
    const item = TELEMETRY_NAV.find((entry) => entry.slug === "metadata");
    expect(item).toMatchObject({
      label: "Metadata Explorer",
      group: "Evidence & Lineage",
    });
    expect(item?.mobilePrimary).not.toBe(true);
    expect(TELEMETRY_NAV.filter((entry) => entry.mobilePrimary)).toHaveLength(4);
  });

  it("builds and recognizes the env-scoped metadata route", () => {
    expect(telemetryHref("env-1", "metadata")).toBe(
      "/lab/env/env-1/telemetry/metadata",
    );
    expect(
      isTelemetryItemActive(
        "/lab/env/env-1/telemetry/metadata",
        "env-1",
        "metadata",
      ),
    ).toBe(true);
  });
});
