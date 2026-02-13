import { NextRequest } from "next/server";
import { listFallbackPipeline } from "@/lib/labV1Fallback";
import { proxyOrFallback } from "@/lib/v1Proxy";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  return proxyOrFallback(request, `/v1/pipeline${url.search}`, async () => {
    const envId = String(url.searchParams.get("env_id") || "").trim();
    if (!envId) {
      return Response.json({ message: "env_id is required" }, { status: 400 });
    }
    return Response.json(listFallbackPipeline(envId));
  });
}
