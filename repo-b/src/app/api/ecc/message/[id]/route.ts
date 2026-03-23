import { eccError } from "@/lib/server/eccApi";
import { getMessageDetail, messageAction } from "@/lib/server/eccStore";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const envId = new URL(request.url).searchParams.get("env_id") || undefined;
  const detail = getMessageDetail(params.id, envId);
  if (!detail) return eccError("message not found", 404);
  return Response.json(detail);
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = (await request.json()) as {
    env_id?: string;
    actor_user_id?: string | null;
    action?: "mark_done" | "snooze_until" | "unsnooze" | "mark_requires_reply" | "add_note" | "create_payable";
    value?: string;
    note?: string;
  };
  if (!body.action) return eccError("action is required");
  const updated = messageAction(params.id, {
    env_id: body.env_id,
    actor_user_id: body.actor_user_id,
    action: body.action,
    value: body.value,
    note: body.note,
  });
  if (!updated) return eccError("message not found", 404);
  return Response.json(updated);
}
