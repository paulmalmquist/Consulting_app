import { describe, expect, it } from "vitest";
import { DISCOVERY_QUESTIONS, scoreDiscovery } from "./scoring";

describe("scoreDiscovery", () => {
  it("blocks incomplete scores and names missing questions", () => {
    const result = scoreDiscovery({ manual_cycle: "low" });

    expect(result.complete).toBe(false);
    expect(result.overallScore).toBeNull();
    expect(result.missingQuestionIds).toContain("manual_rework");
    expect(result.missingQuestionLabels).toContain("Manual rework");
  });

  it("scores a complete high-readiness response", () => {
    const answers = Object.fromEntries(
      DISCOVERY_QUESTIONS.map((question) => [question.id, question.options[0].id]),
    );

    const result = scoreDiscovery(answers);

    expect(result.complete).toBe(true);
    expect(result.overallScore).toBe(100);
    expect(result.overallBand).toBe("ready");
    expect(result.categories).toHaveLength(5);
    expect(result.categories.every((category) => category.percent === 100)).toBe(true);
  });
});

