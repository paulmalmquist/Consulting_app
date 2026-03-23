import { eccError } from "@/lib/server/eccApi";
import { delegateItem } from "@/lib/server/eccStore";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    env_id?: string;
    actor_user_id?: string | null;
    item_type?: "message" | "task" | "payable" | "event";
    item_id?: string;
    to_user?: string;
    due_by?: string;
    context_note?: string;
  };
  if (!body.item_type || !body.item_id || !body.to_user || !body.due_by || !body.context_note) {
    return eccError("item_type, item_id, to_user, due_by, and context_note are required");
  }
  const result = delegateItem({
    env_id: body.env_id,
    actor_user_id: body.actor_user_id,
    item_type: body.item_type,
    item_id: body.item_id,
    to_user: body.to_user,
    due_by: body.due_by,
    context_note: body.context_note,
  });
  if (!result) return eccError("unable to delegate item", 404);
  return Response.json(result);
}
