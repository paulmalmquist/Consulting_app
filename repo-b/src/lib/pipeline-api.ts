import { apiFetch } from "@/lib/api";

export type PipelineStage = {
  stage_id: string;
  stage_key: string;
  stage_name: string;
  order_index: number;
  color_token: string | null;
  created_at: string;
  updated_at: string;
};

export type PipelineCard = {
  card_id: string;
  stage_id: string;
  title: string;
  account_name: string | null;
  owner: string | null;
  value_cents: number | null;
  priority: "low" | "medium" | "high" | "critical";
  due_date: string | null;
  notes: string | null;
  rank: number;
  created_at: string;
  updated_at: string;
};

export type PipelineBoard = {
  env_id: string;
  client_name: string;
  industry: string;
  industry_type: string;
  stages: PipelineStage[];
  cards: PipelineCard[];
};

export async function getPipelineBoard(envId: string): Promise<PipelineBoard> {
  return apiFetch<PipelineBoard>("/v1/pipeline", {
    params: { env_id: envId },
  });
}

export async function createPipelineStage(body: {
  env_id: string;
  stage_name: string;
  order_index?: number;
  color_token?: string | null;
}): Promise<PipelineStage> {
  const payload = await apiFetch<{ stage: PipelineStage }>("/v1/pipeline/stages", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return payload.stage;
}

export async function patchPipelineStage(
  stageId: string,
  patch: Partial<{
    stage_name: string;
    order_index: number;
    color_token: string | null;
  }>
): Promise<PipelineStage> {
  const payload = await apiFetch<{ stage: PipelineStage }>(
    `/v1/pipeline/stages/${stageId}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    }
  );
  return payload.stage;
}

export async function deletePipelineStage(stageId: string): Promise<{
  ok: boolean;
  moved_cards: number;
  target_stage_id: string;
}> {
  return apiFetch(`/v1/pipeline/stages/${stageId}`, {
    method: "DELETE",
  });
}

export async function createPipelineCard(body: {
  env_id: string;
  stage_id?: string | null;
  title: string;
  account_name?: string | null;
  owner?: string | null;
  value_cents?: number | null;
  priority?: "low" | "medium" | "high" | "critical";
  due_date?: string | null;
  notes?: string | null;
  rank?: number | null;
}): Promise<PipelineCard> {
  const payload = await apiFetch<{ card: PipelineCard }>("/v1/pipeline/cards", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return payload.card;
}

export async function patchPipelineCard(
  cardId: string,
  patch: Partial<{
    stage_id: string;
    title: string;
    account_name: string | null;
    owner: string | null;
    value_cents: number | null;
    priority: "low" | "medium" | "high" | "critical";
    due_date: string | null;
    notes: string | null;
    rank: number;
  }>
): Promise<PipelineCard> {
  const payload = await apiFetch<{ card: PipelineCard }>(`/v1/pipeline/cards/${cardId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return payload.card;
}

export async function deletePipelineCard(cardId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/v1/pipeline/cards/${cardId}`, {
    method: "DELETE",
  });
}
