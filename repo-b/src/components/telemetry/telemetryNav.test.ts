import {
  TELEMETRY_NAV,
  TELEMETRY_NAV_GROUPS,
  TELEMETRY_NAV_GROUP_META,
  isTelemetryItemActive,
  telemetryHref,
} from "./telemetryNav";

describe("telemetry navigation structure (7 presentation sections)", () => {
  it("exposes the seven presentation sections in order (Data Engineering hidden; Relativity MES Sandbox added)", () => {
    expect(TELEMETRY_NAV_GROUPS).toEqual([
      "Overview",
      "Operations",
      "Models & Intelligence",
      "Factory & Quality",
      "Evidence & Lineage",
      "Agent Operations",
      // Phase 10 — the synthetic Relativity MES Sandbox, kept visibly separate from the core workbench.
      "Relativity MES Sandbox",
    ]);
  });

  it("assigns every nav item to one of the declared groups", () => {
    for (const item of TELEMETRY_NAV) {
      expect(TELEMETRY_NAV_GROUPS).toContain(item.group);
    }
  });

  it("exposes exactly the presentation-nav slugs (hidden surfaces dropped, routes still resolve)", () => {
    // Hidden-before-delete: Trust Center (governance), How This Works (how-it-works), Resume Evidence
    // (evidence), Test Intelligence (copilot), and the whole Data Engineering group are intentionally
    // dropped from the nav. Their routes still resolve for deep links. Any OTHER slug change is a regression.
    const slugs = TELEMETRY_NAV.map((n) => n.slug).sort();
    expect(slugs).toEqual(
      [
        "",
        "calibration",
        "control-tower",
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
        // Phase 10 — Relativity MES Sandbox section.
        "relativity-mes",
        "relativity-mes/genealogy",
        "relativity-mes/ncr",
        "relativity-mes/cost",
        "relativity-mes/lineage",
      ].sort(),
    );
    // The hidden slugs must NOT appear in the nav (but their page routes still exist on disk).
    for (const hidden of ["governance", "how-it-works", "evidence", "copilot", "data-engineering"]) {
      expect(slugs).not.toContain(hidden);
    }
    expect(slugs.some((s) => s.startsWith("data-engineering/"))).toBe(false);
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
    // Three mobile-primary tabs remain after Test Intelligence (copilot) was hidden.
    expect(TELEMETRY_NAV.filter((entry) => entry.mobilePrimary)).toHaveLength(3);
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

  it("provides icon + accent metadata for every displayed nav group (collapsible icon rail)", () => {
    for (const group of TELEMETRY_NAV_GROUPS) {
      const meta = TELEMETRY_NAV_GROUP_META[group];
      expect(meta).toBeDefined();
      expect(meta.icon).toMatch(/^M/); // SVG path data
      expect(meta.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("no longer surfaces any Data Engineering nav items (group hidden; routes still resolve)", () => {
    expect(TELEMETRY_NAV.filter((n) => n.group === "Data Engineering")).toHaveLength(0);
    // The nested route still builds/recognizes for deep links even though it is not in the nav.
    expect(telemetryHref("env-1", "data-engineering/grain")).toBe(
      "/lab/env/env-1/telemetry/data-engineering/grain",
    );
    expect(
      isTelemetryItemActive(
        "/lab/env/env-1/telemetry/data-engineering/grain", "env-1", "data-engineering/grain",
      ),
    ).toBe(true);
  });
});
