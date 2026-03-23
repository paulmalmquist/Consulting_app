"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  runScenarioV2,
  getRunAssetCashflows,
  getRunReturnMetrics,
} from "@/lib/bos-api";
import type { AssetCashflow, ReturnMetricsRow } from "@/lib/bos-api";

export interface RunResult {
  run_id: string;
  summary: Record<string, unknown>;
  cashflows: AssetCashflow[];
  metrics: ReturnMetricsRow[];
}

export type RecalcStatus = "idle" | "dirty" | "recalculating";

interface UseAutoRecalcReturn {
  triggerRecalc: () => void;
  manualRecalc: () => void;
  status: RecalcStatus;
  result: RunResult | null;
  lastUpdatedAt: Date | null;
  error: string | null;
}

const DEBOUNCE_MS = 600;

export function useAutoRecalc(
  scenarioId: string | null,
  enabled: boolean,
): UseAutoRecalcReturn {
  const [status, setStatus] = useState<RecalcStatus>("idle");
  const [result, setResult] = useState<RunResult | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recalcInFlightRef = useRef(false);
  const needsRerunRef = useRef(false);
  const scenarioIdRef = useRef(scenarioId);

  // Track scenario changes to reset state
  useEffect(() => {
    if (scenarioIdRef.current !== scenarioId) {
      scenarioIdRef.current = scenarioId;
      setResult(null);
      setLastUpdatedAt(null);
      setError(null);
      setStatus("idle");
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      recalcInFlightRef.current = false;
      needsRerunRef.current = false;
    }
  }, [scenarioId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const executeRecalc = useCallback(async () => {
    if (!scenarioId || !enabled) return;

    recalcInFlightRef.current = true;
    setStatus("recalculating");
    setError(null);

    try {
      const runResult = await runScenarioV2(scenarioId);
      // Check if scenario changed while we were running
      if (scenarioIdRef.current !== scenarioId) return;

      const [cashflows, metrics] = await Promise.all([
        getRunAssetCashflows(runResult.run_id),
        getRunReturnMetrics(runResult.run_id),
      ]);

      if (scenarioIdRef.current !== scenarioId) return;

      setResult({
        run_id: runResult.run_id,
        summary: runResult.summary || {},
        cashflows,
        metrics,
      });
      setLastUpdatedAt(new Date());
      setError(null);
    } catch (err) {
      if (scenarioIdRef.current !== scenarioId) return;
      setError(err instanceof Error ? err.message : "Recalculation failed");
    } finally {
      recalcInFlightRef.current = false;

      // If another trigger came in while we were running, do one more run
      if (needsRerunRef.current && scenarioIdRef.current === scenarioId) {
        needsRerunRef.current = false;
        void executeRecalc();
      } else {
        setStatus("idle");
      }
    }
  }, [scenarioId, enabled]);

  const triggerRecalc = useCallback(() => {
    if (!scenarioId || !enabled) return;

    // If already recalculating, queue a re-run after current completes
    if (recalcInFlightRef.current) {
      needsRerunRef.current = true;
      return;
    }

    setStatus("dirty");

    // Clear existing debounce
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void executeRecalc();
    }, DEBOUNCE_MS);
  }, [scenarioId, enabled, executeRecalc]);

  const manualRecalc = useCallback(() => {
    if (!scenarioId || !enabled) return;

    // Clear debounce and run immediately
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (recalcInFlightRef.current) {
      needsRerunRef.current = true;
      return;
    }

    void executeRecalc();
  }, [scenarioId, enabled, executeRecalc]);

  return {
    triggerRecalc,
    manualRecalc,
    status,
    result,
    lastUpdatedAt,
    error,
  };
}
