import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScenarioPressurePanel, isPlaceholderScenarios } from "./ScenarioPressurePanel";
import { makeMatch } from "@/lib/historyrhymes/rhymesFixtures";

const REAL_SCENARIOS = {
  bull: { probability: 0.18, narrative: "Disinflation resumes; curve bull-steepens." },
  base: { probability: 0.55, narrative: "Range-bound late cycle persists." },
  bear: { probability: 0.27, narrative: "Credit stress propagates from CRE." },
};

describe("isPlaceholderScenarios", () => {
  it("detects the v1 narrative marker and the exact 0.25/0.50/0.25 triple", () => {
    expect(isPlaceholderScenarios(makeMatch().scenarios)).toBe(true);
    expect(isPlaceholderScenarios({
      bull: { probability: 0.25, narrative: "x" },
      base: { probability: 0.5, narrative: "y" },
      bear: { probability: 0.25, narrative: "z" },
    })).toBe(true);
    expect(isPlaceholderScenarios(REAL_SCENARIOS)).toBe(false);
  });
});

describe("ScenarioPressurePanel", () => {
  it("renders v1 placeholders as pending — no probability bars, no numbers", () => {
    const match = makeMatch();
    render(<ScenarioPressurePanel scenarios={match.scenarios} confidenceMeta={match.confidence_meta} />);
    const panel = screen.getByTestId("hr-scenario-panel");
    expect(panel.getAttribute("data-pending")).toBe("true");
    expect(screen.getByTestId("hr-scenario-pending-note").textContent).toContain("Stage 5");
    expect(screen.queryByTestId("hr-scenario-bar-bull")).toBeNull();
    expect(screen.queryByText("25%")).toBeNull();
    expect(screen.queryByText("50%")).toBeNull();
  });

  it("renders real scenarios as probability bars with numbers and narratives", () => {
    const match = makeMatch();
    render(<ScenarioPressurePanel scenarios={REAL_SCENARIOS} confidenceMeta={match.confidence_meta} />);
    expect(screen.getByTestId("hr-scenario-panel").getAttribute("data-pending")).toBe("false");
    expect(screen.getByTestId("hr-scenario-bar-bull")).toBeTruthy();
    expect(screen.getByText("55%")).toBeTruthy();
    expect(screen.getByText(/Credit stress propagates/)).toBeTruthy();
  });

  it("renders null confidence_meta fields as 'not yet computed (v1)', never zeros", () => {
    const match = makeMatch();
    render(<ScenarioPressurePanel scenarios={REAL_SCENARIOS} confidenceMeta={match.confidence_meta} />);
    const meta = screen.getByTestId("hr-confidence-meta");
    expect(meta.textContent).toContain("not yet computed (v1)");
    expect(meta.textContent).toContain("sample size");
    expect(meta.textContent).toContain("42");
    expect(meta.textContent).not.toMatch(/agent agreement0/);
  });

  it("degraded freshness renders 'unavailable (degraded)'", () => {
    render(
      <ScenarioPressurePanel scenarios={REAL_SCENARIOS}
        confidenceMeta={{ ...makeMatch().confidence_meta, data_freshness_hours: null }} />,
    );
    expect(screen.getByTestId("hr-confidence-meta").textContent).toContain("unavailable (degraded)");
  });

  it("null scenarios (match failed) renders the fail-closed empty state", () => {
    render(<ScenarioPressurePanel scenarios={null} confidenceMeta={null} />);
    const empty = screen.getByTestId("hr-empty-state");
    expect(empty.getAttribute("data-zone")).toBe("scenarios");
    expect(empty.textContent).toContain("match request failed");
  });
});
