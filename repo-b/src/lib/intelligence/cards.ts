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

// ── Analyzer trigger (connective seam) ────────────────────────────────────────
// The three deterministic analyzers (telemetry, data-platform, business) compute
// findings on the backend; passing persist:true upserts each finding as an intel card
// (idempotent by source_ref), so running this makes new findings appear in the feed.
export type AnalyzerKind = "telemetry" | "data-platform" | "business";

export const ANALYZER_KINDS: AnalyzerKind[] = ["telemetry", "data-platform", "business"];

interface AnalyzeResponse {
  analyzer_type?: string;
  findings?: unknown[];
  null_reasons?: unknown[];
  cards_upserted?: number;
  null_reason?: string | null;
}

export interface RunAnalyzersResult {
  ran: AnalyzerKind[];           // analyzers that returned a response (success or fail-closed)
  failed: AnalyzerKind[];        // analyzers whose request itself rejected
  cardsUpserted: number;         // total cards written across all analyzers
}

// Run the analyzers in parallel and persist their findings as cards. allSettled so one
// analyzer failing never blocks the others; each analyzer already fails closed server-side.
export async function runAnalyzers(
  env: string,
  biz: string,
  kinds: AnalyzerKind[] = ANALYZER_KINDS,
): Promise<RunAnalyzersResult> {
  const settled = await Promise.allSettled(
    kinds.map((kind) =>
      apiFetch<AnalyzeResponse>(`/api/ade/analyze/${kind}`, {
        method: "POST",
        body: JSON.stringify({ env_id: env, business_id: biz, persist: true }),
      }),
    ),
  );
  const ran: AnalyzerKind[] = [];
  const failed: AnalyzerKind[] = [];
  let cardsUpserted = 0;
  settled.forEach((outcome, i) => {
    if (outcome.status === "fulfilled") {
      ran.push(kinds[i]);
      cardsUpserted += outcome.value?.cards_upserted ?? 0;
    } else {
      failed.push(kinds[i]);
    }
  });
  return { ran, failed, cardsUpserted };
}

// ── Analytics reels (connective trigger) ──────────────────────────────────────
// Roll up the env's persisted finding/alert cards into story (reel) cards. Deterministic,
// no LLM — reads existing cards and composes narrative tiles. Run the analyzers first so
// there are findings to roll up.
interface ReelsResponse {
  reels_upserted?: number;
  groups?: number;
  null_reasons?: unknown[];
  null_reason?: string | null;
}

export interface GenerateReelsResult {
  reelsUpserted: number;
  ok: boolean; // false when the request itself rejected
}

export async function generateReels(env: string, biz: string): Promise<GenerateReelsResult> {
  try {
    const res = await apiFetch<ReelsResponse>("/api/ade/intel/reels/generate", {
      method: "POST",
      body: JSON.stringify({ env_id: env, business_id: biz }),
    });
    return { reelsUpserted: res?.reels_upserted ?? 0, ok: true };
  } catch {
    return { reelsUpserted: 0, ok: false };
  }
}

// ── Executive autopilot — deterministic morning brief (no LLM) ─────────────────
// Build/refresh today's morning brief; it lands as an 'autopilot' story card in the feed.
interface MorningBriefResponse {
  card_id?: string | null;
  null_reason?: string | null;
}

export interface GenerateBriefResult {
  cardId: string | null;
  ok: boolean;
}

export async function generateMorningBrief(env: string, biz: string): Promise<GenerateBriefResult> {
  try {
    const res = await apiFetch<MorningBriefResponse>("/api/ade/intel/morning-brief/generate", {
      method: "POST",
      body: JSON.stringify({ env_id: env, business_id: biz }),
    });
    return { cardId: res?.card_id ?? null, ok: true };
  } catch {
    return { cardId: null, ok: false };
  }
}

// ── Agent personalities (deterministic role lenses) ───────────────────────────
// Run a role agent (or all) to filter existing cards into role-tagged rollup cards.
// Deterministic, NO LLM. created_by on produced cards is 'agent:<type>'.
export type AgentType = "cfo" | "operations" | "data_quality" | "risk";

export const AGENT_LABELS: Record<AgentType, string> = {
  cfo: "CFO",
  operations: "Operations",
  data_quality: "Data Quality",
  risk: "Risk",
};

// The created_by tag an agent stamps on its cards — used to filter the feed by agent.
export const agentCreatedBy = (a: AgentType): string => `agent:${a}`;

interface AgentRunResponse {
  results?: { agent_type: string; matched: number; card_id: string | null; null_reason: string | null }[];
  cards_upserted?: number;
  null_reason?: string | null;
}

export interface RunAgentResult {
  cardsUpserted: number;
  ok: boolean;
}

// Run one agent (agentType) or all four (omit). Persists role-tagged rollup cards.
export async function runAgent(
  env: string,
  biz: string,
  agentType?: AgentType,
): Promise<RunAgentResult> {
  try {
    const res = await apiFetch<AgentRunResponse>("/api/ade/agents/run", {
      method: "POST",
      body: JSON.stringify({ env_id: env, business_id: biz, agent_type: agentType ?? null }),
    });
    return { cardsUpserted: res?.cards_upserted ?? 0, ok: true };
  } catch {
    return { cardsUpserted: 0, ok: false };
  }
}

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  dashboard: "Dashboard",
  report: "Report",
  story: "Story",
  investigation: "Investigation",
  forecast: "Forecast",
  finding: "Finding",
  alert: "Alert",
};
