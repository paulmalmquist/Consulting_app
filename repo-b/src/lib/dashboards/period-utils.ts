/**
 * Period utility functions for multi-period dashboard data fetching.
 */

/**
 * Generate an array of prior periods ending at `currentPeriod`.
 *
 * @param currentPeriod - e.g. "2026Q1", "2026-03", "2026"
 * @param count - number of periods to generate (including current)
 * @param grain - "quarterly" | "monthly" | "annual"
 * @returns array of period strings in chronological order
 *
 * @example
 *   generatePriorPeriods("2026Q1", 8, "quarterly")
 *   // => ["2024Q2", "2024Q3", "2024Q4", "2025Q1", "2025Q2", "2025Q3", "2025Q4", "2026Q1"]
 */
export function generatePriorPeriods(
  currentPeriod: string,
  count: number,
  grain: "monthly" | "quarterly" | "annual" = "quarterly",
): string[] {
  if (count <= 0) return [];

  if (grain === "quarterly") {
    const match = currentPeriod.match(/^(\d{4})Q([1-4])$/i);
    if (!match) return [currentPeriod];
    let year = parseInt(match[1], 10);
    let q = parseInt(match[2], 10);

    const periods: string[] = [];
    // Walk backwards count-1 steps, then reverse
    for (let i = 0; i < count; i++) {
      periods.push(`${year}Q${q}`);
      q -= 1;
      if (q < 1) {
        q = 4;
        year -= 1;
      }
    }
    return periods.reverse();
  }

  if (grain === "monthly") {
    // Expect "YYYY-MM"
    const match = currentPeriod.match(/^(\d{4})-(\d{2})$/);
    if (!match) return [currentPeriod];
    let year = parseInt(match[1], 10);
    let month = parseInt(match[2], 10);

    const periods: string[] = [];
    for (let i = 0; i < count; i++) {
      periods.push(`${year}-${String(month).padStart(2, "0")}`);
      month -= 1;
      if (month < 1) {
        month = 12;
        year -= 1;
      }
    }
    return periods.reverse();
  }

  if (grain === "annual") {
    const match = currentPeriod.match(/^(\d{4})/);
    if (!match) return [currentPeriod];
    let year = parseInt(match[1], 10);

    const periods: string[] = [];
    for (let i = 0; i < count; i++) {
      periods.push(`${year}`);
      year -= 1;
    }
    return periods.reverse();
  }

  return [currentPeriod];
}
