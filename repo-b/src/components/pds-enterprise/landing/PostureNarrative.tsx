import type { LandingHeroMetrics, RiskSummaryModel } from "./types";

export function PostureNarrative({
  hero,
  riskSummary,
  openActionCount,
}: {
  hero: LandingHeroMetrics;
  riskSummary: RiskSummaryModel;
  openActionCount: number;
}) {
  const parts: string[] = [];

  const postureLabel = hero.posture;
  const varianceMovingAgainstPlan = hero.netVariance < 0;

  if (varianceMovingAgainstPlan) {
    parts.push(`Portfolio is ${postureLabel}, but variance is moving against plan.`);
  } else {
    parts.push(`Portfolio is ${postureLabel}.`);
  }

  if (riskSummary.largestNegativeDriver && riskSummary.largestNegativeDriver !== "no dominant driver") {
    parts.push(`Current exposure is concentrated in ${riskSummary.largestNegativeDriver}.`);
  }

  if (openActionCount > 0) {
    parts.push(`${openActionCount} open intervention${openActionCount !== 1 ? "s" : ""} require action before the next recovery report.`);
  }

  return (
    <p className="text-sm text-bm-muted2 leading-relaxed max-w-3xl">
      {parts.join(" ")}
    </p>
  );
}
