import { NextRequest } from "next/server";
import { buildFallbackChatResponse } from "@/lib/labV1Fallback";
import { proxyOrFallback } from "@/lib/v1Proxy";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return proxyOrFallback(request, "/v1/chat", async () => {
    const body = (await request.json().catch(() => ({}))) as {
      env_id?: string;
      message?: string;
    };
    const envId = String(body.env_id || "").trim();
    const message = String(body.message || "").trim();
    if (!envId) {
      return Response.json({ message: "env_id is required" }, { status: 400 });
    }
    if (!message) {
      return Response.json({ message: "message is required" }, { status: 400 });
    }
    return Response.json(buildFallbackChatResponse({ envId, message }));
  });
}
