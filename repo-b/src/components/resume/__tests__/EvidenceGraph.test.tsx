import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import EvidenceGraphPage from "../EvidenceGraphPage";
import {
  CAPABILITIES,
  GAP_ITEMS,
  PROOF_ARTIFACTS,
  credibilityScore,
  enterpriseReadiness,
  evidenceMix,
  demoableArtifactCount,
  namedGapsWithPlans,
  type Capability,
} from "../evidenceGraphData";

function makeRow(overrides: Partial<Capability>): Capability {
  return {
    id: "x",
    capability: "X",
    whyItMatters: "",
    evidenceSource: "",
    status: "Production",
    relatedExperience: "",
    winstonSurface: null,
    confidence: 5,
    interviewTalkingPoint: "",
    gapNextAction: null,
    domain: ["DataEngineering"],
    roleTargets: ["Data-Engineering"],
    ...overrides,
  };
}

describe("evidenceGraphData KPI math", () => {
  it("credibilityScore is near 5 for a Production + demoable + max-confidence row", () => {
    const rows = [makeRow({ status: "Production", confidence: 5, demoable: true })];
    const score = credibilityScore(rows, []);
    expect(score).toBeGreaterThan(4.9);
    expect(score).toBeLessThanOrEqual(5);
  });

  it("credibilityScore is low for a Gap + min-confidence row (status 0.2 × conf 0.2 × scale 5 = 0.2)", () => {
    const rows = [makeRow({ status: "Gap", confidence: 1 })];
    const score = credibilityScore(rows, []);
    expect(score).toBeCloseTo(0.2, 2);
  });

  it("credibilityScore returns 0 for empty rows", () => {
    expect(credibilityScore([], [])).toBe(0);
  });

  it("credibilityScore awards the gap-transparency bonus only when gaps have plans", () => {
    const rows = [makeRow({ status: "Production", confidence: 5, demoable: true })];
    const withPlan = credibilityScore(rows, [
      {
        id: "g1",
        capability: "x",
        currentLevel: "—",
        plannedWinstonImpl: "do the thing",
        proofArtifactNeeded: "demo",
        status: "Planned",
      },
    ]);
    const withoutPlan = credibilityScore(rows, [
      {
        id: "g1",
        capability: "x",
        currentLevel: "—",
        plannedWinstonImpl: "",
        proofArtifactNeeded: "",
        status: "Planned",
      },
    ]);
    expect(withPlan).toBeGreaterThanOrEqual(withoutPlan);
    expect(withPlan).toBeLessThanOrEqual(5);
  });

  it("enterpriseReadiness excludes capabilities with no declared operational controls", () => {
    const rows = [
      makeRow({ id: "a", operationalControls: { governance: true, observability: true } }),
      makeRow({ id: "b" }),
    ];
    const { ratio } = enterpriseReadiness(rows);
    expect(ratio).toBe(1);
  });

  it("enterpriseReadiness reports the weakest control across applicable rows", () => {
    const rows = [
      makeRow({
        id: "a",
        operationalControls: { governance: true, evalCoverage: false, observability: true },
      }),
      makeRow({
        id: "b",
        operationalControls: { governance: true, evalCoverage: false, observability: true },
      }),
    ];
    const { weakestControl } = enterpriseReadiness(rows);
    expect(weakestControl).toBe("evalCoverage");
  });

  it("evidenceMix returns counts across all five statuses", () => {
    const rows = [
      makeRow({ id: "a", status: "Production" }),
      makeRow({ id: "b", status: "Winston" }),
      makeRow({ id: "c", status: "Winston" }),
      makeRow({ id: "d", status: "Gap" }),
    ];
    const mix = evidenceMix(rows);
    expect(mix.Production).toBe(1);
    expect(mix.Winston).toBe(2);
    expect(mix.Prototype).toBe(0);
    expect(mix.Gap).toBe(1);
  });

  it("demoableArtifactCount counts artifacts plus deduped demoable rows", () => {
    const artifacts = [{ id: "art1", title: "t", summary: "s", status: "Production" as const }];
    const rows = [
      makeRow({ id: "a", demoable: true, status: "Production" }),
      makeRow({ id: "b", demoable: false }),
    ];
    expect(demoableArtifactCount(rows, artifacts)).toBe(2);
  });

  it("namedGapsWithPlans counts gaps that have both plan and proof", () => {
    const result = namedGapsWithPlans(GAP_ITEMS);
    expect(result.total).toBe(GAP_ITEMS.length);
    expect(result.withPlans).toBe(GAP_ITEMS.length); // all seeded with plans
  });
});

describe("Honesty rules on the seeded dataset", () => {
  it("never tags Production with Novendor/Winston-only experience", () => {
    const offenders = CAPABILITIES.filter(
      (r) =>
        r.status === "Production" &&
        /\b(novendor|winston)\b/i.test(r.relatedExperience) &&
        !/(kayne|jll)/i.test(r.relatedExperience),
    );
    expect(offenders).toEqual([]);
  });

  it("never tags Winston with JLL/Kayne professional credit", () => {
    const offenders = CAPABILITIES.filter(
      (r) =>
        r.status === "Winston" &&
        /\b(kayne|jll)\b/i.test(r.relatedExperience),
    );
    expect(offenders).toEqual([]);
  });

  it("requires gapNextAction on Gap rows", () => {
    const offenders = CAPABILITIES.filter((r) => r.status === "Gap" && !r.gapNextAction);
    expect(offenders).toEqual([]);
  });
});

describe("EvidenceGraphPage rendering", () => {
  it("renders header, KPIs, and seeded capabilities", () => {
    render(<EvidenceGraphPage />);
    expect(screen.getByRole("heading", { name: /Evidence Ledger/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Credibility Score/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Enterprise Readiness/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Demoable Artifacts/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Named Gaps with Plans/i).length).toBeGreaterThan(0);
    // At least one Production capability and one Gap row render.
    expect(screen.getAllByText("Production").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Gap").length).toBeGreaterThan(0);
  });

  it("filter chip narrows the visible capabilities", async () => {
    render(<EvidenceGraphPage />);
    const user = userEvent.setup();

    const productionCountAll = screen.getAllByText("Production").length;

    // Click the Gap status chip to narrow to Gap-only rows.
    const gapChips = screen.getAllByRole("button", { name: /^Gap$/i });
    await user.click(gapChips[0]);

    // After filter, Production rows should no longer render in the table.
    const productionCountAfter = screen.queryAllByText("Production").length;
    expect(productionCountAfter).toBeLessThan(productionCountAll);
  });

  it("references the proof artifacts seeded in data", () => {
    render(<EvidenceGraphPage />);
    expect(screen.getByText(PROOF_ARTIFACTS[0].title)).toBeInTheDocument();
  });
});
