import { NextRequest } from "next/server";
import { createFallbackPipelineCard } from "@/lib/labV1Fallback";
import { proxyOrFallback } from "@/lib/v1Proxy";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return proxyOrFallback(request, "/v1/pipeline/cards", async () => {
    const body = (await request.json().catch(() => ({}))) as {
      env_id?: string;
      stage_id?: string | null;
      title?: string;
      account_name?: string | null;
      owner?: string | null;
      value_cents?: number | null;
      priority?: "low" | "medium" | "high" | "critical";
      due_date?: string | null;
      notes?: string | null;
      rank?: number | null;
    };
    const envId = String(body.env_id || "").trim();
    const title = String(body.title || "").trim();
    if (!envId) {
      return Response.json({ message: "env_id is required" }, { status: 400 });
    }
    if (!title) {
      return Response.json({ message: "title is required" }, { status: 400 });
    }
    const card = createFallbackPipelineCard({
      env_id: envId,
      stage_id: body.stage_id,
      title,
      account_name: body.account_name,
      owner: body.owner,
      value_cents: body.value_cents,
      priority: body.priority,
      due_date: body.due_date,
      notes: body.notes,
      rank: body.rank,
    });
    if (!card) {
      return Response.json({ message: "No stage available" }, { status: 404 });
    }
    return Response.json({ card }, { status: 201 });
  });
}
