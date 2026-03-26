"use client";

import { useEffect, useState } from "react";
import { getJvDetail } from "@/lib/bos-api";
import type { JvDetailResult } from "@/lib/bos-api";

export function useJvDetail(fundId: string | null, quarter: string, scenarioId?: string | null) {
  const [data, setData] = useState<JvDetailResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fundId) return;
    setLoading(true);
    setError(null);

    getJvDetail({
      fund_id: fundId,
      quarter,
      scenario_id: scenarioId ?? undefined,
    })
      .then(setData)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [fundId, quarter, scenarioId]);

  return { data, loading, error };
}
