"use client";

import { apiFetch } from "@/lib/api";

// Default business identifier for the demo mount. Any environment can mount
// the ADE surface and pass its own envId through route params; this is only
// the fallback tenant for the seeded demo. Centralized so no component
// hardcodes it inline. (Same resolution approach as other lab surfaces,
// declared here so the ADE core stays independent of any other domain module.)
export const ADE_DEFAULT_BUSINESS_ID = "7e1eb000-0000-4000-a000-000000000001";

export interface SkillSummary {
  name: string;
  module: string;
  description: string;
  permission: string;
  side_effect_class: string;
  permission_required: string;
  confirmation_required: boolean;
  lane_tags: string[];
  skill_tags: string[];
  input_fields: string[];
}

export interface ModuleSummary {
  module: string;
  tool_count: number;
}

export interface SkillRegistryResponse {
  tools: SkillSummary[];
  modules: ModuleSummary[];
  null_reason: string | null;
}

export interface ToolDetailResponse extends SkillSummary {
  input_schema: Record<string, unknown>;
  result_adapter?: string | null;
  null_reason: string | null;
}

export type ConnectorStatus = "live" | "stub" | "script" | "missing";

export interface ConnectorInfo {
  provider: string;
  status: ConnectorStatus;
  mode: string;
  evidence_path: string | null;
  reason: string;
  tool_count: number;
}

export interface ConnectorsResponse {
  connectors: ConnectorInfo[];
  null_reason: string | null;
}

export interface ReceiptRow {
  tool_name: string;
  status: string;
  permission_mode: string;
  latency_ms: number | null;
  actor: string | null;
  created_at: string | null;
}

export interface ReceiptsResponse {
  runs: ReceiptRow[];
  null_reason: string | null;
}

export const getSkillRegistry = () =>
  apiFetch<SkillRegistryResponse>("/api/ade/skill-registry");

export const getToolDetail = (name: string) =>
  apiFetch<ToolDetailResponse>(`/api/ade/skill-registry/${encodeURIComponent(name)}`);

export const getConnectors = () =>
  apiFetch<ConnectorsResponse>("/api/ade/connectors");

export const getReceipts = (env: string, biz: string) =>
  apiFetch<ReceiptsResponse>("/api/ade/runs", {
    params: { env_id: env, business_id: biz },
  });
