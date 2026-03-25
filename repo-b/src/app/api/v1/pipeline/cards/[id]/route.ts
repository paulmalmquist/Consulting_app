import { NextRequest } from "next/server";
import {
  deleteFallbackPipelineCard,
  updateFallbackPipelineCard,
} from "@/lib/labV1Fallback";
import { proxyOrFallback } from "@/lib/v1Proxy";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return proxyOrFallback(request, `/v1/pipeline/cards/${params.id}`, async () => {
    const body = (await request.json().catch(() => ({}))) as Partial<{
      stage_id: string;
      title: string;
      account_name: string | null;
      owner: string | null;
      value_cents: number | null;
      priority: "low" | "medium" | "high" | "critical";
      due_date: string | null;
      notes: string | null;
      rank: number;
    }>;
    const card = updateFallbackPipelineCard(params.id, body);
    if (!card) {
      return Response.json({ message: "Pipeline card not found" }, { status: 404 });
    }
    return Response.json({ card });
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return proxyOrFallback(request, `/v1/pipeline/cards/${params.id}`, async () => {
    const result = deleteFallbackPipelineCard(params.id);
    if (!result) {
      return Response.json({ message: "Pipeline card not found" }, { status: 404 });
    }
    return Response.json(result);
  });
}
