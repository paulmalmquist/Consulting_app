"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export type GatewayStatus = "operational" | "degraded" | "checking";

export type GatewayHealth = {
  status: GatewayStatus;
  model: string;
  lastChecked: Date | null;
};

export function useGatewayHealth(): GatewayHealth {
  const [state, setState] = useState<GatewayHealth>({
    status: "checking",
    model: "unknown",
    lastChecked: null,
  });

  useEffect(() => {
    apiFetch<{ enabled: boolean; model?: string }>("/api/ai/gateway/health")
      .then((data) => {
        setState({
          status: data.enabled ? "operational" : "degraded",
          model: data.model || "unknown",
          lastChecked: new Date(),
        });
      })
      .catch(() => {
        setState({
          status: "degraded",
          model: "unknown",
          lastChecked: new Date(),
        });
      });
  }, []);

  return state;
}
