"use client";

import { useCallback, useEffect, useState } from "react";
import {
  checkInTrainingRegistration,
  createTrainingActivity,
  createTrainingContact,
  createTrainingEvent,
  fetchTrainingWorkspace,
  seedTrainingWorkspace,
  updateTrainingTask,
  upsertTrainingRegistration,
  type TrainingWorkspace,
} from "@/lib/local-training-api";

export function useTrainingWorkspace(envId: string, businessId: string | null, ready: boolean) {
  const [workspace, setWorkspace] = useState<TrainingWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!businessId) {
      setWorkspace(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchTrainingWorkspace(envId, businessId);
      setWorkspace(payload);
    } catch (err) {
      setWorkspace(null);
      setError(err instanceof Error ? err.message : "Unable to load local training CRM workspace.");
    } finally {
      setLoading(false);
    }
  }, [businessId, envId]);

  useEffect(() => {
    if (!ready) return;
    void reload();
  }, [ready, reload]);

  const runMutation = useCallback(
    async (task: () => Promise<unknown>) => {
      setMutating(true);
      setError(null);
      try {
        await task();
        await reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Mutation failed.");
      } finally {
        setMutating(false);
      }
    },
    [reload],
  );

  return {
    workspace,
    loading,
    mutating,
    error,
    reload,
    seed: async () => {
      if (!businessId) return;
      await runMutation(() => seedTrainingWorkspace({ env_id: envId, business_id: businessId }));
    },
    createContact: async (body: Record<string, unknown>) => {
      if (!businessId) return;
      await runMutation(() => createTrainingContact({ ...body, env_id: envId, business_id: businessId }));
    },
    createEvent: async (body: Record<string, unknown>) => {
      if (!businessId) return;
      await runMutation(() => createTrainingEvent({ ...body, env_id: envId, business_id: businessId }));
    },
    createActivity: async (body: Record<string, unknown>) => {
      if (!businessId) return;
      await runMutation(() => createTrainingActivity({ ...body, env_id: envId, business_id: businessId }));
    },
    upsertRegistration: async (body: Record<string, unknown>) => {
      if (!businessId) return;
      await runMutation(() => upsertTrainingRegistration({ ...body, env_id: envId, business_id: businessId }));
    },
    checkIn: async (registrationId: string, attendedFlag = true) => {
      await runMutation(() => checkInTrainingRegistration(registrationId, attendedFlag));
    },
    updateTask: async (taskId: string, status: "open" | "in_progress" | "done") => {
      await runMutation(() => updateTrainingTask(taskId, status));
    },
  };
}
