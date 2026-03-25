import { eccEnvId } from "@/lib/server/eccApi";
import { getDemoStatus } from "@/lib/server/eccStore";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const envId = eccEnvId(request);
  return Response.json(getDemoStatus(envId));
}
