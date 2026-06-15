"use client";

import { apiFetch } from "@/lib/api";

// Intelligence Card System client (plan PR 4). Data model + components only — no
// home wiring (PR 5). Mounted under /api/ade/intel to reuse the committed ADE proxy.

export type CardType =
  | "dashboard" | "report" | "story" | "investigation" | "forecast" | "finding" | "alert";

export interface IntelCard {
  id: string;
  card_type: CardType;
  title: string;
  summary: string | null;
  source_ref: Record<string, unknown>;
  priority_score: number;
  anomaly_flag: boolean;
  created_by: string | null;
  is_dismissed: boolean;
  last_updated_at: string | null;
  created_at: string | null;
}

export interface CardListResponse {
  cards: IntelCard[];
  null_reason: string | null;
}

export interface UpsertCardInput {
  card_type: CardType;
  title: string;
  summary?: string;
  source_ref?: Record<string, unknown>;
  priority_score?: number;
  anomaly_flag?: boolean;
  created_by?: string;
}

const DEFAULT_BUSINESS_ID = "7e1eb000-0000-4000-a000-000000000001";

export const getCards = (
  env: string,
  opts: { biz?: string; limit?: number; includeDismissed?: boolean; cardType?: CardType } = {},
) =>
  apiFetch<CardListResponse>("/api/ade/intel/cards", {
    params: {
      env_id: env,
      business_id: opts.biz ?? DEFAULT_BUSINESS_ID,
      limit: opts.limit ? String(opts.limit) : undefined,
      include_dismissed: opts.includeDismissed ? "true" : undefined,
      card_type: opts.cardType,
    },
  });

export const upsertCard = (env: string, input: UpsertCardInput, biz: string = DEFAULT_BUSINESS_ID) =>
  // apiFetch passes options straight to fetch and does not serialize — body must be a JSON string.
  apiFetch<IntelCard & { null_reason: string | null }>("/api/ade/intel/cards", {
    method: "POST",
    body: JSON.stringify({ env_id: env, business_id: biz, ...input }),
  });

export const dismissCard = (env: string, id: string, biz: string = DEFAULT_BUSINESS_ID) =>
  apiFetch<IntelCard & { null_reason: string | null }>(`/api/ade/intel/cards/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ env_id: env, business_id: biz, dismiss: true }),
  });

export const bumpCardPriority = (env: string, id: string, delta: number, biz: string = DEFAULT_BUSINESS_ID) =>
  apiFetch<IntelCard & { null_reason: string | null }>(`/api/ade/intel/cards/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ env_id: env, business_id: biz, priority_delta: delta }),
  });

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  dashboard: "Dashboard",
  report: "Report",
  story: "Story",
  investigation: "Investigation",
  forecast: "Forecast",
  finding: "Finding",
  alert: "Alert",
};
