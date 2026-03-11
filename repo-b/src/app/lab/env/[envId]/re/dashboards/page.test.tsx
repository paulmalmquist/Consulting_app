/**
 * Tests for the from_winston localStorage bridge on the dashboards page.
 *
 * Rather than rendering the full page (which has many context dependencies),
 * these tests verify the localStorage read/write contract that the page relies on.
 * The bridge is: command bar writes spec → localStorage → page reads on mount.
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { DashboardWidget } from "@/lib/dashboards/types";
import { createWinstonDashboardStorageKey } from "@/lib/dashboards/winston-bridge";

const SAMPLE_SPEC = {
  name: "Monthly Operating Report",
  archetype: "monthly_operating_report",
  prompt: "monthly operating report",
  widgets: [
    {
      id: "kpi_summary_0",
      type: "metrics_strip" as const,
      config: { metrics: [{ key: "NOI" }], entity_type: "asset", quarter: null, scenario: "actual" },
      layout: { x: 0, y: 0, w: 12, h: 2 },
    },
    {
      id: "noi_trend_1",
      type: "trend_line" as const,
      config: { title: "NOI Trend", metrics: [{ key: "NOI" }], entity_type: "asset", quarter: null, scenario: "actual" },
      layout: { x: 0, y: 2, w: 12, h: 3 },
    },
  ] as DashboardWidget[],
  entity_scope: { entity_type: "asset", env_id: "env-123", business_id: "biz-456", fund_id: null },
  quarter: null,
};

// ── Simulate the bridge logic from GlobalCommandBar.tsx ──────────────────

function writeSpecToLocalStorage(spec: typeof SAMPLE_SPEC): string {
  const specKey = createWinstonDashboardStorageKey();
  localStorage.setItem(specKey, JSON.stringify(spec));
  return specKey;
}

// ── Simulate the read logic from dashboards/page.tsx ────────────────────

function readSpecFromLocalStorage(specKey: string): {
  widgets: DashboardWidget[];
  name: string;
  archetype: string;
  prompt: string;
} | null {
  try {
    const raw = localStorage.getItem(specKey);
    if (!raw) return null;
    const spec = JSON.parse(raw) as {
      widgets?: DashboardWidget[];
      name?: string;
      archetype?: string;
      prompt?: string;
    };
    if (!spec.widgets?.length) return null;
    localStorage.removeItem(specKey);
    return {
      widgets: spec.widgets,
      name: spec.name || "Winston Dashboard",
      archetype: spec.archetype || "custom",
      prompt: spec.prompt || "",
    };
  } catch {
    return null;
  }
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("from_winston localStorage bridge", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("writes spec to localStorage with a unique key", () => {
    const key1 = writeSpecToLocalStorage(SAMPLE_SPEC);
    const key2 = writeSpecToLocalStorage(SAMPLE_SPEC);
    expect(key1).toMatch(/^winston_dashboard_\d+_[a-z0-9]+$/i);
    expect(key2).toMatch(/^winston_dashboard_\d+_[a-z0-9]+$/i);
    expect(key1).not.toBe(key2);
    expect(localStorage.length).toBe(2);
  });

  it("reads spec back correctly from localStorage", () => {
    const specKey = writeSpecToLocalStorage(SAMPLE_SPEC);
    const result = readSpecFromLocalStorage(specKey);

    expect(result).not.toBeNull();
    expect(result!.name).toBe("Monthly Operating Report");
    expect(result!.archetype).toBe("monthly_operating_report");
    expect(result!.widgets).toHaveLength(2);
    expect(result!.widgets[0].type).toBe("metrics_strip");
  });

  it("removes the entry from localStorage after reading", () => {
    const specKey = writeSpecToLocalStorage(SAMPLE_SPEC);
    readSpecFromLocalStorage(specKey);
    expect(localStorage.getItem(specKey)).toBeNull();
  });

  it("returns null when key is missing", () => {
    const result = readSpecFromLocalStorage("winston_dashboard_nonexistent");
    expect(result).toBeNull();
  });

  it("returns null when spec has no widgets", () => {
    const emptySpec = { ...SAMPLE_SPEC, widgets: [] };
    const specKey = `winston_dashboard_empty`;
    localStorage.setItem(specKey, JSON.stringify(emptySpec));
    const result = readSpecFromLocalStorage(specKey);
    expect(result).toBeNull();
  });

  it("returns null when value is malformed JSON", () => {
    localStorage.setItem("winston_dashboard_bad", "not-json{{");
    const result = readSpecFromLocalStorage("winston_dashboard_bad");
    expect(result).toBeNull();
  });

  it("uses defaults for missing name/archetype fields", () => {
    const minimalSpec = { widgets: SAMPLE_SPEC.widgets };
    const specKey = "winston_dashboard_minimal";
    localStorage.setItem(specKey, JSON.stringify(minimalSpec));
    const result = readSpecFromLocalStorage(specKey);

    expect(result!.name).toBe("Winston Dashboard");
    expect(result!.archetype).toBe("custom");
    expect(result!.prompt).toBe("");
  });

  it("spec widgets preserve layout coordinates", () => {
    const specKey = writeSpecToLocalStorage(SAMPLE_SPEC);
    const result = readSpecFromLocalStorage(specKey);

    const kpi = result!.widgets[0];
    expect(kpi.layout.x).toBe(0);
    expect(kpi.layout.y).toBe(0);
    expect(kpi.layout.w).toBe(12);
    expect(kpi.layout.h).toBe(2);
  });
});
