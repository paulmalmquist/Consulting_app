import { eccError } from "@/lib/server/eccApi";
import { getPayableDetail, payableAction } from "@/lib/server/eccStore";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const envId = new URL(request.url).searchParams.get("env_id") || undefined;
  const detail = getPayableDetail(params.id, envId);
  if (!detail) return eccError("payable not found", 404);
  return Response.json(detail);
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = (await request.json()) as {
    env_id?: string;
    actor_user_id?: string | null;
    action?: "approve" | "decline" | "mark_paid" | "needs_review" | "add_note";
    note?: string;
  };
  if (!body.action) return eccError("action is required");
  const updated = payableAction(params.id, {
    env_id: body.env_id,
    actor_user_id: body.actor_user_id,
    action: body.action,
    note: body.note,
  });
  if (!updated) return eccError("payable not found", 404);
  return Response.json(updated);
}
