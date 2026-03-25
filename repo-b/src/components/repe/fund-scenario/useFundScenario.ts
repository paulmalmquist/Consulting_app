"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { apiFetch } from "@/components/repe/model/types";
import {
  listModelScenarios,
  createModelScenario,
  cloneModelScenario,
  deleteModelScenario,
  getFundBaseScenario,
} from "@/lib/bos-api";
import type { ModelScenario, FundBaseScenario } from "@/lib/bos-api";
import type { ReModel } from "@/components/repe/model/types";

function getCurrentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `${now.getFullYear()}Q${q}`;
}

export function useFundScenario(modelId: string, envId: string) {
  const [model, setModel] = useState<ReModel | null>(null);
  const [scenarios, setScenarios] = useState<ModelScenario[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [quarter, setQuarter] = useState(getCurrentQuarter);
  const [baseResult, setBaseResult] = useState<FundBaseScenario | null>(null);
  const [scenarioResult, setScenarioResult] = useState<FundBaseScenario | null>(null);
  const [loading, setLoading] = useState(true);
  const [resultLoading, setResultLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fundId = model?.primary_fund_id ?? model?.fund_id ?? null;

  const activeScenario = useMemo(
    () => scenarios.find((s) => s.id === activeScenarioId) ?? null,
    [scenarios, activeScenarioId],
  );

  const isBaseScenario = activeScenario?.is_base ?? false;

  // Load model + scenarios
  useEffect(() => {
    if (!modelId || !envId) return;
    setLoading(true);
    setError(null);

    Promise.allSettled([
      apiFetch<ReModel>(`/api/re/v2/models/${modelId}`),
      listModelScenarios(modelId),
    ]).then(([modelRes, scenariosRes]) => {
      if (modelRes.status === "fulfilled") {
        setModel(modelRes.value);
      } else {
        setError("Failed to load model");
      }
      if (scenariosRes.status === "fulfilled") {
        const sc = scenariosRes.value;
        setScenarios(sc);
        const base = sc.find((s) => s.is_base) ?? sc[0];
        if (base) setActiveScenarioId(base.id);
      }
      setLoading(false);
    });
  }, [modelId, envId]);

  // Load base scenario results when fund/quarter/scenario changes
  useEffect(() => {
    if (!fundId || !quarter) return;
    setResultLoading(true);

    const promises: Promise<FundBaseScenario>[] = [
      // Always load the "official" base (no scenario_id)
      getFundBaseScenario({ fund_id: fundId, quarter, liquidation_mode: "current_state" }),
    ];

    // If the active scenario is not the base, also load its results
    if (activeScenarioId && !isBaseScenario) {
      promises.push(
        getFundBaseScenario({
          fund_id: fundId,
          quarter,
          scenario_id: activeScenarioId,
          liquidation_mode: "current_state",
        }),
      );
    }

    Promise.allSettled(promises).then((results) => {
      if (results[0].status === "fulfilled") {
        setBaseResult(results[0].value);
        // If no separate scenario, the scenario result is the base
        if (promises.length === 1) {
          setScenarioResult(results[0].value);
        }
      }
      if (results.length > 1 && results[1].status === "fulfilled") {
        setScenarioResult(results[1].value);
      }
      setResultLoading(false);
    });
  }, [fundId, quarter, activeScenarioId, isBaseScenario]);

  const handleCreateScenario = useCallback(
    async (name: string) => {
      if (!modelId) return;
      const created = await createModelScenario(modelId, { name });
      setScenarios((prev) => [...prev, created]);
      setActiveScenarioId(created.id);
    },
    [modelId],
  );

  const handleCloneScenario = useCallback(
    async (scenarioId: string) => {
      const source = scenarios.find((s) => s.id === scenarioId);
      const cloned = await cloneModelScenario(scenarioId, `${source?.name ?? "Scenario"} (copy)`);
      setScenarios((prev) => [...prev, cloned]);
      setActiveScenarioId(cloned.id);
    },
    [scenarios],
  );

  const handleDeleteScenario = useCallback(
    async (scenarioId: string) => {
      await deleteModelScenario(scenarioId);
      setScenarios((prev) => {
        const next = prev.filter((s) => s.id !== scenarioId);
        if (activeScenarioId === scenarioId) {
          const base = next.find((s) => s.is_base) ?? next[0];
          setActiveScenarioId(base?.id ?? null);
        }
        return next;
      });
    },
    [activeScenarioId],
  );

  const recalculate = useCallback(() => {
    if (!fundId || !quarter) return;
    setResultLoading(true);
    getFundBaseScenario({
      fund_id: fundId,
      quarter,
      scenario_id: isBaseScenario ? undefined : (activeScenarioId ?? undefined),
      liquidation_mode: "current_state",
    }).then((result) => {
      if (isBaseScenario) {
        setBaseResult(result);
      }
      setScenarioResult(result);
      setResultLoading(false);
    }).catch(() => {
      setResultLoading(false);
    });
  }, [fundId, quarter, activeScenarioId, isBaseScenario]);

  return {
    model,
    fundId,
    scenarios,
    activeScenarioId,
    activeScenario,
    isBaseScenario,
    quarter,
    setQuarter,
    setActiveScenarioId,
    baseResult,
    scenarioResult,
    loading,
    resultLoading,
    error,
    recalculate,
    handleCreateScenario,
    handleCloneScenario,
    handleDeleteScenario,
  };
}
