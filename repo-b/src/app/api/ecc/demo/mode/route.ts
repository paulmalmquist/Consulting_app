import { eccError } from "@/lib/server/eccApi";
import { setDemoMode } from "@/lib/server/eccStore";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { env_id?: string; enabled?: boolean };
  if (typeof body.enabled !== "boolean") {
    return eccError("enabled must be provided as a boolean");
  }
  return Response.json(setDemoMode(body.enabled, body.env_id));
}
