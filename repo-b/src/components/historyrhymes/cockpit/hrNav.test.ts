import { describe, it, expect } from "vitest";
import { HR_NAV, hrHref, isHrItemActive, hrSectionLabel } from "./hrNav";

const ENV = "demo";
const BASE = `/lab/env/${ENV}/historyrhymes`;

describe("HR_NAV", () => {
  it("contains all expected slugs in order", () => {
    const slugs = HR_NAV.map((n) => n.slug);
    expect(slugs).toContain("");
    expect(slugs).toContain("morning-book");
    expect(slugs).toContain("research");
    expect(slugs).toContain("planning");
    expect(slugs).toContain("episodes");
    expect(slugs).toContain("calibration");
    expect(slugs).toContain("admin");
    // Cockpit is first
    expect(slugs[0]).toBe("");
  });
});

describe("hrHref", () => {
  it("returns base URL for cockpit (empty slug)", () => {
    expect(hrHref(ENV, "")).toBe(BASE);
  });

  it("appends slug for non-cockpit routes", () => {
    expect(hrHref(ENV, "planning")).toBe(`${BASE}/planning`);
    expect(hrHref(ENV, "episodes")).toBe(`${BASE}/episodes`);
    expect(hrHref(ENV, "calibration")).toBe(`${BASE}/calibration`);
  });
});

describe("isHrItemActive — cockpit (empty slug)", () => {
  it("active on the index route", () => {
    expect(isHrItemActive(BASE, ENV, "")).toBe(true);
  });

  it("active on /routine (compatibility alias)", () => {
    expect(isHrItemActive(`${BASE}/routine`, ENV, "")).toBe(true);
  });

  it("active on /routine/sub-path", () => {
    expect(isHrItemActive(`${BASE}/routine/anything`, ENV, "")).toBe(true);
  });

  it("NOT active on /planning", () => {
    expect(isHrItemActive(`${BASE}/planning`, ENV, "")).toBe(false);
  });

  it("NOT active on /morning-book", () => {
    expect(isHrItemActive(`${BASE}/morning-book`, ENV, "")).toBe(false);
  });
});

describe("isHrItemActive — named slugs", () => {
  it("planning is active on /planning", () => {
    expect(isHrItemActive(`${BASE}/planning`, ENV, "planning")).toBe(true);
  });

  it("planning is active on /planning/sub", () => {
    expect(isHrItemActive(`${BASE}/planning/sub`, ENV, "planning")).toBe(true);
  });

  it("planning is NOT active on /episodes", () => {
    expect(isHrItemActive(`${BASE}/episodes`, ENV, "planning")).toBe(false);
  });

  it("episodes active on /episodes", () => {
    expect(isHrItemActive(`${BASE}/episodes`, ENV, "episodes")).toBe(true);
  });

  it("calibration active on /calibration", () => {
    expect(isHrItemActive(`${BASE}/calibration`, ENV, "calibration")).toBe(true);
  });

  it("research active on /research but not on cockpit base", () => {
    expect(isHrItemActive(`${BASE}/research`, ENV, "research")).toBe(true);
    expect(isHrItemActive(BASE, ENV, "research")).toBe(false);
  });
});

describe("hrSectionLabel", () => {
  it("returns Cockpit for the index and /routine", () => {
    expect(hrSectionLabel(BASE, ENV)).toBe("Cockpit");
    expect(hrSectionLabel(`${BASE}/routine`, ENV)).toBe("Cockpit");
  });

  it("returns Planning for /planning", () => {
    expect(hrSectionLabel(`${BASE}/planning`, ENV)).toBe("Planning");
  });

  it("returns Episodes for /episodes", () => {
    expect(hrSectionLabel(`${BASE}/episodes`, ENV)).toBe("Episodes");
  });

  it("returns Calibration for /calibration", () => {
    expect(hrSectionLabel(`${BASE}/calibration`, ENV)).toBe("Calibration");
  });
});
