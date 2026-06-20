import { describe, it, expect } from "vitest";

import {
  CAPABILITIES,
  MEDALLION,
  ML_LIFECYCLE,
  ARCHITECTURE_NODES,
  ARCHITECTURE_EDGES,
  KNOWN_GAPS,
  JUMP_SECTIONS,
  MCP_REGISTRY_SNAPSHOT,
  TOOL_INVENTORY,
  type EvidenceLink,
} from "./howItWorksData";
import { TELEMETRY_NAV } from "./telemetryNav";

// Valid deep-link targets = the telemetry nav slugs (incl. "" for Overview).
const VALID_SLUGS = new Set<string>(TELEMETRY_NAV.map((n) => n.slug));

describe("howItWorksData — honesty invariants (the page is honest by construction)", () => {
  it("every capability has a non-empty note", () => {
    for (const c of CAPABILITIES) {
      expect(c.note.trim(), `note for "${c.capability}"`).not.toBe("");
    }
  });

  it("a row with no evidence renders 'Not available' — so it MUST carry a reason (non-empty note)", () => {
    const noEvidence = CAPABILITIES.filter((c) => c.evidence.length === 0);
    expect(noEvidence.length, "expected some planned/blocked rows").toBeGreaterThan(0);
    for (const c of noEvidence) {
      expect(c.note.trim(), `reason for "${c.capability}"`).not.toBe("");
    }
  });

  it("every evidence slug points at a real telemetry route (no dead deep-links)", () => {
    const check = (links: EvidenceLink[], ctx: string) => {
      for (const l of links) {
        if (l.slug !== undefined) {
          expect(VALID_SLUGS.has(l.slug), `${ctx}: slug "${l.slug}"`).toBe(true);
        }
      }
    };
    CAPABILITIES.forEach((c) => check(c.evidence, c.capability));
    for (const hop of MEDALLION) {
      if (hop.slug !== undefined) expect(VALID_SLUGS.has(hop.slug), `medallion ${hop.stage}`).toBe(true);
    }
    for (const m of ML_LIFECYCLE) {
      if (m.slug !== undefined) expect(VALID_SLUGS.has(m.slug), `ml ${m.name}`).toBe(true);
    }
  });

  it("a prod_verified row must have a live surface to click — no production claim without evidence", () => {
    // Production verification happened on novendor.ai 2026-06-18 (every Built deep-link clicked live),
    // so rows may now be prod_verified — but ONLY if they expose a clickable live surface.
    for (const c of CAPABILITIES) {
      if (c.verify === "prod_verified") {
        expect(c.evidence.length, `prod_verified "${c.capability}" must carry an evidence link`).toBeGreaterThan(0);
      }
    }
    for (const hop of MEDALLION) {
      if (hop.verify === "prod_verified") expect(hop.slug, `prod_verified medallion ${hop.stage} must have a slug`).toBeTruthy();
    }
    for (const m of ML_LIFECYCLE) {
      if (m.verify === "prod_verified") expect(m.slug, `prod_verified ml ${m.name} must have a slug`).toBeTruthy();
    }
  });

  it("planned/blocked capabilities never carry an evidence link (no overclaim)", () => {
    for (const c of CAPABILITIES) {
      if (c.impl === "planned" || c.impl === "blocked") {
        expect(c.evidence.length, `"${c.capability}" should have no link`).toBe(0);
      }
    }
  });

  it("architecture edges only reference declared nodes", () => {
    const ids = new Set(ARCHITECTURE_NODES.map((n) => n.id));
    for (const e of ARCHITECTURE_EDGES) {
      expect(ids.has(e.from), `edge from ${e.from}`).toBe(true);
      expect(ids.has(e.to), `edge to ${e.to}`).toBe(true);
    }
  });

  it("known gaps and jump sections are present and surfaced early", () => {
    expect(KNOWN_GAPS.length).toBeGreaterThanOrEqual(5);
    expect(JUMP_SECTIONS).toHaveLength(5);
    expect(JUMP_SECTIONS.map((s) => s.anchor)).toEqual([
      "data-trust", "ai-orchestration", "model-lifecycle", "audit-tools", "delivery-os",
    ]);
  });

  it("static reference tables are non-empty", () => {
    expect(MCP_REGISTRY_SNAPSHOT.length).toBeGreaterThan(0);
    expect(TOOL_INVENTORY.length).toBeGreaterThan(0);
  });
});
