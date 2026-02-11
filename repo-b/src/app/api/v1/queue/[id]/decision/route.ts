import { NextRequest } from "next/server";
import { recordFallbackQueueDecision } from "@/lib/labV1Fallback";
import { proxyOrFallback } from "@/lib/v1Proxy";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return proxyOrFallback(request, `/v1/queue/${params.id}/decision`, async () => {
    const body = (await request.json().catch(() => ({}))) as {
      decision?: string;
    };
    const decision = body.decision;
    if (decision !== "approve" && decision !== "deny") {
      return Response.json(
        { message: "decision must be approve or deny" },
        { status: 400 }
      );
    }
    const updated = recordFallbackQueueDecision(params.id, decision);
    if (!updated) {
      return Response.json({ message: "Queue item not found" }, { status: 404 });
    }
    return Response.json({ ok: true, item: updated });
  });
}
