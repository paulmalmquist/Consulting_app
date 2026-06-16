"use client";

import { apiFetch } from "@/lib/api";

// Typed client for the ADE Ops Orchestrator read-only surface. Hits the
// `ade-ops` proxy (independent of the deletable ADE product surface).

export interface OpsSkill {
  name: string;
  family: string;
  description: string;
  risk_tier: number;
  risk_tier_name: string;
  mode: string;
  executable: boolean;
  approval_required: boolean;
  permission_required: string;
  lane: string;
  input_fields: string[];
}

export interface SkillsResponse {
  skills: OpsSkill[];
  risk_tiers: Record<string, string>;
  executable_max_tier: number;
  null_reason: string | null;
}

export interface Evidence {
  label: string;
  value: unknown;
  source: string;
  as_of: string | null;
}

export interface RunResult {
  name: string;
  risk_tier: number;
  mode: string;
  status: "ok" | "degraded" | "blocked";
  recommendation: string | null;
  confidence: string | null;
  evidence: Evidence[];
  null_reason: string | null;
  approval_required: boolean;
  receipt_id: string | null;
  receipt_status: string;
}

export interface RunRow {
  receipt_id: string | null;
  skill: string | null;
  actor: string | null;
  success: boolean | null;
  confidence: number | null;
  tags: string[];
  output_summary: unknown;
  created_at: string | null;
}

export interface RunsResponse {
  runs: RunRow[];
  null_reason: string | null;
}

export const getSkills = () => apiFetch<SkillsResponse>("/api/ade-ops/skills");

export const getRuns = (businessId: string, envId?: string) =>
  apiFetch<RunsResponse>("/api/ade-ops/runs", {
    params: envId ? { business_id: businessId, env_id: envId } : { business_id: businessId },
  });

export const runSkill = (skill: string, inputs: Record<string, unknown>, businessId?: string, envId?: string) =>
  apiFetch<RunResult>("/api/ade-ops/run", {
    method: "POST",
    body: JSON.stringify({ skill, inputs, business_id: businessId, env_id: envId }),
  });
