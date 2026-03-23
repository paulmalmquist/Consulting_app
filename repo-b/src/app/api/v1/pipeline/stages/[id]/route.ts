import { NextRequest } from "next/server";
import {
  deleteFallbackPipelineStage,
  updateFallbackPipelineStage,
} from "@/lib/labV1Fallback";
import { proxyOrFallback } from "@/lib/v1Proxy";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return proxyOrFallback(request, `/v1/pipeline/stages/${params.id}`, async () => {
    const body = (await request.json().catch(() => ({}))) as Partial<{
      stage_name: string;
      order_index: number;
      color_token: string | null;
    }>;
    const stage = updateFallbackPipelineStage(params.id, body);
    if (!stage) {
      return Response.json({ message: "Pipeline stage not found" }, { status: 404 });
    }
    return Response.json({ stage });
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return proxyOrFallback(request, `/v1/pipeline/stages/${params.id}`, async () => {
    const result = deleteFallbackPipelineStage(params.id);
    if (!result) {
      return Response.json(
        { message: "Pipeline stage not found or cannot delete final stage" },
        { status: 404 }
      );
    }
    return Response.json(result);
  });
}
