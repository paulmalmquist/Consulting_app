"use client";

import { useEffect, useState } from "react";
import { getQuarterlyTimeline } from "@/lib/bos-api";
import type { QuarterlyTimeline } from "@/lib/bos-api";

function quartersBefore(quarter: string, count: number): string {
  const year = parseInt(quarter.slice(0, 4), 10);
  const q = parseInt(quarter.slice(-1), 10);
  let y = year;
  let qn = q;
  for (let i = 0; i < count; i++) {
    qn--;
    if (qn < 1) { qn = 4; y--; }
  }
  return `${y}Q${qn}`;
}

export function useQuarterlyTimeline(
  fundId: string | null,
  currentQuarter: string,
  rangeQuarters: number = 8,
  scenarioId?: string | null,
) {
  const [data, setData] = useState<QuarterlyTimeline | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromQuarter = quartersBefore(currentQuarter, rangeQuarters - 1);

  useEffect(() => {
    if (!fundId) return;
    setLoading(true);
    setError(null);

    getQuarterlyTimeline({
      fund_id: fundId,
      from_quarter: fromQuarter,
      to_quarter: currentQuarter,
      scenario_id: scenarioId ?? undefined,
    })
      .then(setData)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [fundId, fromQuarter, currentQuarter, scenarioId]);

  return { data, loading, error };
}
