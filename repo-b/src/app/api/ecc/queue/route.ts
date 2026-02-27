import { eccEnvId } from "@/lib/server/eccApi";
import { getQueue } from "@/lib/server/eccStore";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const envId = eccEnvId(request);
  return Response.json(getQueue(envId));
}
