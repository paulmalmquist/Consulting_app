import { eccError } from "@/lib/server/eccApi";
import { deleteVip, updateVip } from "@/lib/server/eccStore";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = (await request.json()) as {
    env_id?: string;
    vip_tier?: number;
    sla_hours?: number;
    tags?: string[];
  };
  const updated = updateVip(params.id, body);
  if (!updated) return eccError("vip contact not found", 404);
  return Response.json(updated);
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const envId = new URL(request.url).searchParams.get("env_id") || undefined;
  const deleted = deleteVip(params.id, envId);
  if (!deleted) return eccError("vip contact not found", 404);
  return Response.json(deleted);
}
