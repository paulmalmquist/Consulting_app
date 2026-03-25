import { eccError, eccEnvId } from "@/lib/server/eccApi";
import { createVip, listVips } from "@/lib/server/eccStore";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return Response.json({ contacts: listVips(eccEnvId(request)) });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    env_id?: string;
    name?: string;
    email?: string;
    phone?: string;
    vip_tier?: number;
    sla_hours?: number;
    tags?: string[];
  };
  if (!body.name || typeof body.vip_tier !== "number" || typeof body.sla_hours !== "number") {
    return eccError("name, vip_tier, and sla_hours are required");
  }
  return Response.json(
    createVip({
      env_id: body.env_id,
      name: body.name,
      email: body.email,
      phone: body.phone,
      vip_tier: body.vip_tier,
      sla_hours: body.sla_hours,
      tags: body.tags,
    })
  );
}
