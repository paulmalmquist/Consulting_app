import { getChartColors, CHART_COLORS } from "@/components/charts/chart-theme";

const BASE: Record<string, string> = {
  REPE: "#38BDF8",
  "Real Estate": "#38BDF8",
  "Real Estate Private Equity": "#38BDF8",
  Legal: "#A78BFA",
  Law: "#A78BFA",
  Healthcare: "#34D399",
  Health: "#34D399",
  PDS: "#F59E0B",
  "Professional Services": "#F59E0B",
  Construction: "#F97316",
  Finance: "#22D3EE",
  Financial: "#22D3EE",
  Technology: "#818CF8",
  Tech: "#818CF8",
  Other: "#64748B",
  Unknown: "#64748B",
};

export function colorForIndustry(name: string | null | undefined, index = 0): string {
  const key = (name ?? "Other").trim();
  if (BASE[key]) return BASE[key];
  const palette =
    typeof window === "undefined"
      ? CHART_COLORS.scenario
      : getChartColors().scenario;
  return palette[index % palette.length];
}

export function buildIndustryColorMap(industries: readonly string[]): Record<string, string> {
  const map: Record<string, string> = {};
  industries.forEach((ind, i) => {
    map[ind] = colorForIndustry(ind, i);
  });
  return map;
}
