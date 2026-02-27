import { eccEnvId } from "@/lib/server/eccApi";
import { getTodayBrief } from "@/lib/server/eccStore";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const envId = eccEnvId(request);
  const type = (url.searchParams.get("type") || "am") as "am" | "pm";
  return Response.json(getTodayBrief(envId, type));
}
