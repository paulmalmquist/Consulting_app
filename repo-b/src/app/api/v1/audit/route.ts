import { NextRequest } from "next/server";
import { listFallbackAudit } from "@/lib/labV1Fallback";
import { proxyOrFallback } from "@/lib/v1Proxy";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  return proxyOrFallback(request, `/v1/audit${url.search}`, async () => {
    const envId = url.searchParams.get("env_id");
    if (!envId) {
      return Response.json({ message: "env_id is required" }, { status: 400 });
    }
    return Response.json({ items: listFallbackAudit(envId) });
  });
}
