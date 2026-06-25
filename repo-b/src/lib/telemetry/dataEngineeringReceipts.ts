"use client";

import { apiFetch } from "@/lib/api";

// Telemetry-side client for the Data Engineering receipt action (Phase 2D). These call the telemetry
// router (NOT ADE core): a read-only "profile metadata graph" action that writes one real audit event,
// and a reader for those real receipts. Run Autopsy uses both.

export interface DeReceiptRow {
  tool_name: string;
  action: string;
  status: string;
  permission_mode: string;
  actor: string | null;
  latency_ms: number | null;
  created_at: string | null;
  input_summary: Record<string, unknown>;
  result_summary: Record<string, unknown>;
  null_reason: string | null;
}

export interface DeReceiptsResponse {
  runs: DeReceiptRow[];
  null_reason: string | null;
}

export interface ProfileMetadataResponse extends DeReceiptRow {
  receipt_id: string;
}

export const profileMetadataGraph = (env: string, biz: string) =>
  apiFetch<ProfileMetadataResponse>("/api/telemetry/data-engineering/profile-metadata", {
    method: "POST",
    params: { env_id: env, business_id: biz },
  });

export const getDeReceipts = (env: string, biz: string) =>
  apiFetch<DeReceiptsResponse>("/api/telemetry/data-engineering/receipts", {
    params: { env_id: env, business_id: biz },
  });
