import { describe, it, expect } from "vitest";

import {
  ARCH_VIEWS, TECH, KNOWN_LIMITATIONS, MASTER_LANES,
  type ArchNode,
} from "./telemetryArchitectureData";
import { TELEMETRY_NAV } from "./telemetryNav";

// Valid deep-link targets = the telemetry nav slugs (incl. "" for Overview).
const VALID_SLUGS = new Set<string>(TELEMETRY_NAV.map((n) => n.slug));
const ALL_NODES: ArchNode[] = ARCH_VIEWS.flatMap((v) => v.nodes);

describe("telemetryArchitectureData — honest by construction", () => {
  it("has the four expected views (master + 3 detail)", () => {
    expect(ARCH_VIEWS.map((v) => v.id)).toEqual(["master", "nasa", "stream", "factory"]);
    const master = ARCH_VIEWS.find((v) => v.id === "master")!;
    expect(master.isMaster).toBe(true);
  });

  it("the master view covers all eight lanes A..H", () => {
    const master = ARCH_VIEWS.find((v) => v.id === "master")!;
    const lanes = new Set(master.nodes.map((n) => String.fromCharCode(65 + n.row)));
    for (const l of MASTER_LANES) expect(lanes.has(l.key), `lane ${l.key} has nodes`).toBe(true);
    expect(lanes.size).toBe(8);
  });

  it("every node has a non-empty plain-English story", () => {
    for (const n of ALL_NODES) {
      expect(n.plain.trim(), `plain for "${n.id}"`).not.toBe("");
    }
  });

  it("every node slug points at a real telemetry route (no dead deep-links)", () => {
    for (const n of ALL_NODES) {
      if (n.slug !== undefined) {
        expect(VALID_SLUGS.has(n.slug), `node "${n.id}" slug "${n.slug}"`).toBe(true);
      }
    }
  });

  it("planned nodes never carry a deep-link (no overclaim)", () => {
    for (const n of ALL_NODES) {
      if (n.status === "planned") {
        expect(n.slug, `planned node "${n.id}" must have no slug`).toBeUndefined();
      }
    }
  });

  it("every warn (known-limitation) node carries an explanation (note or plain story)", () => {
    // Master nodes put the caveat in `note`; detail nodes carry it in `plain` (note is ""). Either
    // way the drawer's "⚠ Known limitation" block has real text to show — never an empty box.
    const warned = ALL_NODES.filter((n) => n.warn);
    expect(warned.length, "expected some known-limitation nodes").toBeGreaterThan(0);
    for (const n of warned) {
      expect((n.note.trim() || n.plain.trim()), `explanation for warn node "${n.id}"`).not.toBe("");
    }
  });

  it("every edge references declared node ids within its own view", () => {
    for (const v of ARCH_VIEWS) {
      const ids = new Set(v.nodes.map((n) => n.id));
      for (const e of v.edges) {
        expect(ids.has(e.from), `${v.id}: edge from ${e.from}`).toBe(true);
        expect(ids.has(e.to), `${v.id}: edge to ${e.to}`).toBe(true);
      }
    }
  });

  it("every node tech key (when set) exists in the TECH legend", () => {
    for (const n of ALL_NODES) {
      if (n.tech) expect(TECH[n.tech], `tech "${n.tech}" on "${n.id}"`).toBeTruthy();
    }
  });

  it("node ids are unique within each view", () => {
    for (const v of ARCH_VIEWS) {
      const ids = v.nodes.map((n) => n.id);
      expect(new Set(ids).size, `${v.id} has duplicate ids`).toBe(ids.length);
    }
  });

  it("surfaces a consolidated known-limitations list", () => {
    expect(KNOWN_LIMITATIONS.length).toBeGreaterThanOrEqual(10);
    for (const lim of KNOWN_LIMITATIONS) expect(lim.trim()).not.toBe("");
  });
});
