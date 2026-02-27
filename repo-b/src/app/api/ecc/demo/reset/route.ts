import { eccEnvId } from "@/lib/server/eccApi";
import { createOrResetMeridianDemo, getDemoStatus } from "@/lib/server/eccStore";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({} as { env_id?: string }));
  const envId = body.env_id || eccEnvId(request);
  createOrResetMeridianDemo(envId);
  return Response.json({
    ok: true,
    status: getDemoStatus(envId),
  });
}
