"use client";

import { apiFetch } from "@/lib/api";
import type {
  EccBriefResponse,
  EccDemoStatus,
  EccMessage,
  EccMessageDetail,
  EccPayable,
  EccPayableDetail,
  EccQueueResponse,
} from "@/lib/ecc/types";

function withEnv(path: string, envId: string) {
  const url = new URL(path, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  url.searchParams.set("env_id", envId);
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}`;
}

export function fetchEccQueue(envId: string) {
  return apiFetch<EccQueueResponse>(withEnv("/api/ecc/queue", envId));
}

export function fetchEccMessage(envId: string, messageId: string) {
  return apiFetch<EccMessageDetail>(withEnv(`/api/ecc/message/${messageId}`, envId));
}

export function fetchEccPayable(envId: string, payableId: string) {
  return apiFetch<EccPayableDetail>(withEnv(`/api/ecc/payable/${payableId}`, envId));
}

export function fetchEccBrief(envId: string, type: "am" | "pm" = "am") {
  const url = new URL("/api/ecc/brief/today", typeof window !== "undefined" ? window.location.origin : "http://localhost");
  url.searchParams.set("env_id", envId);
  url.searchParams.set("type", type);
  return apiFetch<EccBriefResponse>(`${url.pathname}?${url.searchParams.toString()}`);
}

export function generateEccBrief(envId: string, type: "am" | "pm") {
  return apiFetch<EccBriefResponse>(withEnv(`/api/ecc/brief/generate?type=${type}`, envId), {
    method: "POST",
  });
}

export function fetchEccDemoStatus(envId: string) {
  return apiFetch<EccDemoStatus>(withEnv("/api/ecc/demo/status", envId));
}

export function updateEccDemoMode(envId: string, enabled: boolean) {
  return apiFetch<EccDemoStatus>("/api/ecc/demo/mode", {
    method: "POST",
    body: JSON.stringify({ env_id: envId, enabled }),
  });
}

export function resetEccDemo(envId: string) {
  return apiFetch<{ ok: true; status: EccDemoStatus }>("/api/ecc/demo/reset", {
    method: "POST",
    body: JSON.stringify({ env_id: envId }),
  });
}

export function completeMessage(envId: string, messageId: string) {
  return apiFetch<EccMessage>(`/api/ecc/message/${messageId}`, {
    method: "POST",
    body: JSON.stringify({ env_id: envId, action: "mark_done" }),
  });
}

export function snoozeMessage(envId: string, messageId: string, value: string) {
  return apiFetch<EccMessage>(`/api/ecc/message/${messageId}`, {
    method: "POST",
    body: JSON.stringify({ env_id: envId, action: "snooze_until", value }),
  });
}

export function approvePayable(envId: string, payableId: string, note?: string) {
  return apiFetch<EccPayable>(`/api/ecc/payable/${payableId}`, {
    method: "POST",
    body: JSON.stringify({ env_id: envId, action: "approve", note }),
  });
}

export function delegateEccItem(input: {
  envId: string;
  itemType: "message" | "task" | "payable" | "event";
  itemId: string;
  toUser: string;
  dueBy: string;
  contextNote: string;
}) {
  return apiFetch("/api/ecc/delegate", {
    method: "POST",
    body: JSON.stringify({
      env_id: input.envId,
      item_type: input.itemType,
      item_id: input.itemId,
      to_user: input.toUser,
      due_by: input.dueBy,
      context_note: input.contextNote,
    }),
  });
}

export function createPayableFromMessage(envId: string, messageId: string) {
  return apiFetch<EccMessage>(`/api/ecc/message/${messageId}`, {
    method: "POST",
    body: JSON.stringify({ env_id: envId, action: "create_payable" }),
  });
}

export function quickCaptureEcc(envId: string, body: string) {
  return apiFetch<EccMessage>("/api/ecc/quick_capture", {
    method: "POST",
    body: JSON.stringify({ env_id: envId, body }),
  });
}

export function fetchVipContacts(envId: string) {
  return apiFetch<{ contacts: Array<{ id: string; name: string; vip_tier: number; sla_hours: number; tags: string[]; channels: { emails: string[]; phones: string[] } }> }>(
    withEnv("/api/ecc/vips", envId)
  );
}
