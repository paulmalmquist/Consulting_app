import { eccError } from "@/lib/server/eccApi";
import { taskAction } from "@/lib/server/eccStore";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = (await request.json()) as {
    env_id?: string;
    actor_user_id?: string | null;
    action?: "complete" | "reopen" | "change_due" | "add_note" | "delegate";
    due_by?: string;
    note?: string;
    to_user_id?: string;
  };
  if (!body.action) return eccError("action is required");
  const updated = taskAction(params.id, {
    env_id: body.env_id,
    actor_user_id: body.actor_user_id,
    action: body.action,
    due_by: body.due_by,
    note: body.note,
    to_user_id: body.to_user_id,
  });
  if (!updated) return eccError("task not found", 404);
  return Response.json(updated);
}
