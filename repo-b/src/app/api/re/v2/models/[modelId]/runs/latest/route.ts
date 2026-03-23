import { NextRequest, NextResponse } from "next/server";
import { getRepeWorkspace, getModelRunPayload } from "@/lib/server/repe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { modelId: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const workspace = await getRepeWorkspace({
      envId: searchParams.get("env_id") || "a1b2c3d4-0001-0001-0003-000000000001",
      businessId: searchParams.get("business_id"),
      fundId: searchParams.get("fund_id"),
      quarter: searchParams.get("quarter"),
    });
    const model = workspace.models.find((entry) => entry.modelId === params.modelId);
    if (!model?.latestRunId) {
      return NextResponse.json({ error: "No run found for model" }, { status: 404 });
    }
    const payload = await getModelRunPayload(model.latestRunId);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Latest run lookup failed" },
      { status: 400 }
    );
  }
}
