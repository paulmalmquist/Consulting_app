/**
 * Static narrative seed for the visual resume.
 *
 * Renders the career story immediately on page load without waiting for
 * the backend DB round-trip. DB data enhances but never replaces this seed.
 *
 * The seed re-uses the authoritative career fixture and layers on
 * pre-computed capability growth curves that produce visible, compounding
 * graph shapes instead of thin derived values.
 */
import { makeResumeWorkspacePayload } from "@/test/fixtures/resumeWorkspace";
import type { ResumeWorkspacePayload } from "@/lib/bos-api";

/**
 * Pre-computed cumulative capability growth curves.
 * Designed by hand to show compounding skill across 3 dimensions.
 * Each data point is an absolute cumulative value, not a delta.
 */
/**
 * Keyed by actual capability_layer.layer_id values so they map directly
 * into the chart data points and stacked area series.
 *
 * Derived from the user-provided 3-curve model:
 *   data_foundation → split into data_platform + automation_workflow
 *   financial_systems → split into financial_modeling + bi_reporting + executive_decision_support
 *   ai_automation → maps to ai_agentic
 */
const CAPABILITY_GROWTH: Record<string, Array<{ date: string; value: number }>> = {
  data_platform: [
    { date: "2014-08-01", value: 5 },
    { date: "2015-06-01", value: 10 },
    { date: "2016-06-01", value: 18 },
    { date: "2018-02-01", value: 26 },
    { date: "2019-03-01", value: 36 },
    { date: "2020-06-01", value: 50 },
    { date: "2021-06-01", value: 68 },
    { date: "2022-05-01", value: 80 },
    { date: "2023-03-01", value: 92 },
    { date: "2024-02-01", value: 98 },
    { date: "2024-10-01", value: 104 },
    { date: "2025-04-01", value: 118 },
    { date: "2025-09-01", value: 126 },
    { date: "2025-11-01", value: 132 },
  ],
  bi_reporting: [
    { date: "2014-08-01", value: 2 },
    { date: "2015-06-01", value: 6 },
    { date: "2016-06-01", value: 12 },
    { date: "2018-02-01", value: 18 },
    { date: "2019-03-01", value: 22 },
    { date: "2020-06-01", value: 28 },
    { date: "2021-06-01", value: 36 },
    { date: "2022-05-01", value: 50 },
    { date: "2023-03-01", value: 58 },
    { date: "2024-02-01", value: 64 },
    { date: "2024-10-01", value: 70 },
    { date: "2025-04-01", value: 82 },
    { date: "2025-09-01", value: 88 },
    { date: "2025-11-01", value: 92 },
  ],
  financial_modeling: [
    { date: "2014-08-01", value: 0 },
    { date: "2015-06-01", value: 0 },
    { date: "2016-06-01", value: 2 },
    { date: "2018-02-01", value: 8 },
    { date: "2019-03-01", value: 12 },
    { date: "2020-06-01", value: 18 },
    { date: "2021-06-01", value: 24 },
    { date: "2022-05-01", value: 28 },
    { date: "2023-03-01", value: 36 },
    { date: "2024-02-01", value: 52 },
    { date: "2024-10-01", value: 58 },
    { date: "2025-04-01", value: 62 },
    { date: "2025-09-01", value: 64 },
    { date: "2025-11-01", value: 68 },
  ],
  automation_workflow: [
    { date: "2014-08-01", value: 3 },
    { date: "2015-06-01", value: 8 },
    { date: "2016-06-01", value: 15 },
    { date: "2018-02-01", value: 19 },
    { date: "2019-03-01", value: 23 },
    { date: "2020-06-01", value: 29 },
    { date: "2021-06-01", value: 36 },
    { date: "2022-05-01", value: 42 },
    { date: "2023-03-01", value: 46 },
    { date: "2024-02-01", value: 48 },
    { date: "2024-10-01", value: 52 },
    { date: "2025-04-01", value: 58 },
    { date: "2025-09-01", value: 60 },
    { date: "2025-11-01", value: 62 },
  ],
  ai_agentic: [
    { date: "2014-08-01", value: 0 },
    { date: "2015-06-01", value: 0 },
    { date: "2016-06-01", value: 0 },
    { date: "2018-02-01", value: 0 },
    { date: "2019-03-01", value: 0 },
    { date: "2020-06-01", value: 0 },
    { date: "2021-06-01", value: 2 },
    { date: "2022-05-01", value: 5 },
    { date: "2023-03-01", value: 9 },
    { date: "2024-02-01", value: 13 },
    { date: "2024-10-01", value: 17 },
    { date: "2025-04-01", value: 27 },
    { date: "2025-09-01", value: 47 },
    { date: "2025-11-01", value: 73 },
  ],
  executive_decision_support: [
    { date: "2014-08-01", value: 3 },
    { date: "2015-06-01", value: 5 },
    { date: "2016-06-01", value: 7 },
    { date: "2018-02-01", value: 13 },
    { date: "2019-03-01", value: 17 },
    { date: "2020-06-01", value: 22 },
    { date: "2021-06-01", value: 28 },
    { date: "2022-05-01", value: 34 },
    { date: "2023-03-01", value: 38 },
    { date: "2024-02-01", value: 44 },
    { date: "2024-10-01", value: 50 },
    { date: "2025-04-01", value: 56 },
    { date: "2025-09-01", value: 60 },
    { date: "2025-11-01", value: 64 },
  ],
};

let _cached: ResumeWorkspacePayload | null = null;

export function getResumeSeedPayload(): ResumeWorkspacePayload {
  if (_cached) return _cached;

  const base = makeResumeWorkspacePayload();

  // Attach precomputed capability growth curves to the timeline.
  // capabilityGraphData.ts reads this to produce visible compounding curves
  // instead of deriving thin values from initiative importance weights.
  (base.timeline as Record<string, unknown>).precomputed_capability_growth = CAPABILITY_GROWTH;

  _cached = base;
  return _cached;
}
