import {
  TELEMETRY_NAV,
  TELEMETRY_NAV_GROUPS,
  isTelemetryItemActive,
  telemetryHref,
} from "./telemetryNav";

describe("telemetry navigation structure (6-section redesign + Data Engineering)", () => {
  it("exposes the redesign sections in order, with Data Engineering last", () => {
    expect(TELEMETRY_NAV_GROUPS).toEqual([
      "Overview",
      "Operations",
      "Models & Intelligence",
      "Factory & Quality",
      "Evidence & Lineage",
      "Agent Operations",
      "Data Engineering",
    ]);
  });

  it("assigns every nav item to one of the declared groups", () => {
    for (const item of TELEMETRY_NAV) {
      expect(TELEMETRY_NAV_GROUPS).toContain(item.group);
    }
  });

  it("exposes exactly the presentation-nav slugs (governance/how-it-works/evidence hidden, routes still resolve)", () => {
    // PR 2.1 conservative declutter: Trust Center (governance), How This Works (how-it-works), and
    // Resume Evidence (evidence) are intentionally dropped from the nav. Their routes still resolve
    // for deep links; they are simply not surfaced in the rail. Any OTHER slug change is a regression.
    const slugs = TELEMETRY_NAV.map((n) => n.slug).sort();
    expect(slugs).toEqual(
      [
        "",
        "calibration",
        "control-tower",
        "copilot",
        "data-engineering",
        "data-engineering/autopsy",
        "data-engineering/grain",
        "data-engineering/pipelines",
        "data-engineering/relationships",
        "data-engineering/sources",
        "data-engineering/workbench",
        "data-engineering/workflows",
        "factory",
        "factory-ml",
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
    // The hidden slugs must NOT appear in the nav (but their page routes still exist on disk).
    expect(slugs).not.toContain("governance");
    expect(slugs).not.toContain("how-it-works");
    expect(slugs).not.toContain("evidence");
  });

  it("applies the redesign relabels without changing slugs", () => {
    const labelOf = (slug: string) => TELEMETRY_NAV.find((n) => n.slug === slug)?.label;
    expect(labelOf("")).toBe("Overview");
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

  it("registers the seven Data Engineering items under their group", () => {
    const slugs = TELEMETRY_NAV.filter((n) => n.group === "Data Engineering").map((n) => n.slug);
    expect(slugs).toEqual([
      "data-engineering",
      "data-engineering/grain",
      "data-engineering/relationships",
      "data-engineering/pipelines",
      "data-engineering/workflows",
      "data-engineering/workbench",
      "data-engineering/autopsy",
      "data-engineering/sources",
    ]);
  });

  it("builds and recognizes a nested data-engineering route", () => {
    expect(telemetryHref("env-1", "data-engineering/grain")).toBe(
      "/lab/env/env-1/telemetry/data-engineering/grain",
    );
    expect(
      isTelemetryItemActive(
        "/lab/env/env-1/telemetry/data-engineering/grain",
        "env-1",
        "data-engineering/grain",
      ),
    ).toBe(true);
  });
});
