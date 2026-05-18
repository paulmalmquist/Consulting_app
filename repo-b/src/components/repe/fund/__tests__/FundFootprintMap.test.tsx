/**
 * FundFootprintMap — dark-mode regression guards (T6).
 *
 * The primary purpose of this file is to lock in the visual changes from T1.
 * If a future change re-introduces hardcoded light-mode hex into PANEL_CLASS
 * or removes the dark: Tailwind variants, the source-level checks below fail.
 *
 * We deliberately keep render tests minimal — the component is Leaflet-backed
 * with complex async API fetching. The contract we care about is the class
 * strings emitted, not pixel-level rendering.
 */

import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

const COMPONENT_PATH = path.resolve(__dirname, "../FundFootprintMap.tsx");
const source = fs.readFileSync(COMPONENT_PATH, "utf-8");

// ── T1 dark-mode contract ─────────────────────────────────────────────────────

describe("FundFootprintMap source — dark-mode contract (T1 regression guard)", () => {
  it("PANEL_CLASS contains dark:bg-bm-surface", () => {
    expect(source).toContain("dark:bg-bm-surface");
  });

  it("PANEL_CLASS contains dark:border-bm-border", () => {
    expect(source).toContain("dark:border-bm-border");
  });

  it("secondary labels carry dark:text-bm-muted2", () => {
    expect(source).toContain("dark:text-bm-muted2");
  });

  it("primary labels carry dark:text-bm-text", () => {
    expect(source).toContain("dark:text-bm-text");
  });

  it("inactive FilterChip carries dark:border-bm-border", () => {
    // Confirms FilterChip's inactive border was not reverted to border-[#E2E8F0].
    expect(source).toContain("dark:border-bm-border/20");
  });

  it("positive Pill tone carries dark:bg-emerald-900 — dark class not stripped", () => {
    expect(source).toContain("dark:bg-emerald-900");
  });
});

// ── Hardcoded light-mode hex absence ─────────────────────────────────────────

describe("FundFootprintMap source — no hardcoded light-mode hex", () => {
  it("does not contain bg-[#F8FAFC]", () => {
    expect(source).not.toContain("bg-[#F8FAFC]");
  });

  it("does not contain text-[#0F172A]", () => {
    expect(source).not.toContain("text-[#0F172A]");
  });

  it("does not contain text-[#64748B]", () => {
    expect(source).not.toContain("text-[#64748B]");
  });

  it("does not contain border-[#E2E8F0]", () => {
    expect(source).not.toContain("border-[#E2E8F0]");
  });

  it("does not contain bg-[#E2E8F0]", () => {
    expect(source).not.toContain("bg-[#E2E8F0]");
  });

  it("does not contain text-[#334155]", () => {
    expect(source).not.toContain("text-[#334155]");
  });
});

// ── T5 filter persistence contract ───────────────────────────────────────────

describe("FundFootprintMap source — filter persistence (T5 regression guard)", () => {
  it("uses functional setSelection to preserve marker on filter change", () => {
    // T5 fix: setSelection((prev) => ...) form prevents unconditional reset.
    // If reverted to setSelection({ mode: 'portfolio' }) in the .then() callback,
    // the selected marker resets on every filter-triggered API call.
    expect(source).toContain("setSelection((prev)");
  });

  it("passes fitKey prop to MapInner — not the raw data arrays", () => {
    // T5 fix: fitKey increments only on server responses, not on client filter changes.
    // This prevents zoom/pan reset on property-type filter chip clicks.
    expect(source).toContain("fitKey");
  });

  it("increments fitKey in the API .then() callback — not on filter state", () => {
    expect(source).toContain("setFitKey");
  });
});
