"use client";

import { apiFetch } from "@/lib/api";
import { ADE_DEFAULT_BUSINESS_ID } from "./api";

// Workflow Registry client (plan PR 2). Catalog/definitions only — no execution.
// Mounted under /api/ade/workflows to match the committed ADE surface paths.

export type WorkflowDomain = "data_engineering" | "telemetry" | "investigation" | "devops";

export interface WorkflowStep {
  step_name: string;
  tool_name: string | null;
  inputs: string[];
  outputs: string[];
}

export interface WorkflowDefinition {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  domain: WorkflowDomain;
  steps: WorkflowStep[];
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  owner: string | null;
  last_run_at: string | null;
  run_count: number;
  created_at: string | null;
}

export interface WorkflowListResponse {
  workflows: WorkflowDefinition[];
  null_reason: string | null;
}

export interface CreateWorkflowInput {
  name: string;
  domain: WorkflowDomain;
  description?: string;
  steps?: WorkflowStep[];
  owner?: string;
}

export const getWorkflows = (env: string, domain?: WorkflowDomain, biz: string = ADE_DEFAULT_BUSINESS_ID) =>
  apiFetch<WorkflowListResponse>("/api/ade/workflows", {
    params: domain
      ? { env_id: env, business_id: biz, domain }
      : { env_id: env, business_id: biz },
  });

export const getWorkflow = (env: string, id: string, biz: string = ADE_DEFAULT_BUSINESS_ID) =>
  apiFetch<WorkflowDefinition & { null_reason: string | null }>(
    `/api/ade/workflows/${encodeURIComponent(id)}`,
    { params: { env_id: env, business_id: biz } },
  );

export const createWorkflow = (env: string, input: CreateWorkflowInput, biz: string = ADE_DEFAULT_BUSINESS_ID) =>
  // apiFetch passes options straight to fetch and does not serialize — body must be a JSON string.
  apiFetch<WorkflowDefinition & { null_reason: string | null }>("/api/ade/workflows", {
    method: "POST",
    body: JSON.stringify({ env_id: env, business_id: biz, ...input }),
  });

export const DOMAIN_LABELS: Record<WorkflowDomain, string> = {
  data_engineering: "Data Engineering",
  telemetry: "Telemetry",
  investigation: "Investigation",
  devops: "DevOps",
};
