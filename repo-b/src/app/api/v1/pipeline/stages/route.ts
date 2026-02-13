import { NextRequest } from "next/server";
import { createFallbackPipelineStage } from "@/lib/labV1Fallback";
import { proxyOrFallback } from "@/lib/v1Proxy";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return proxyOrFallback(request, "/v1/pipeline/stages", async () => {
    const body = (await request.json().catch(() => ({}))) as {
      env_id?: string;
      stage_name?: string;
      order_index?: number;
      color_token?: string | null;
    };
    const envId = String(body.env_id || "").trim();
    const stageName = String(body.stage_name || "").trim();
    if (!envId) {
      return Response.json({ message: "env_id is required" }, { status: 400 });
    }
    if (!stageName) {
      return Response.json({ message: "stage_name is required" }, { status: 400 });
    }
    const stage = createFallbackPipelineStage({
      env_id: envId,
      stage_name: stageName,
      order_index: body.order_index,
      color_token: body.color_token,
    });
    return Response.json({ stage }, { status: 201 });
  });
}
