import { NextRequest, NextResponse } from "next/server";
import { createIcMemo, getRepeWorkspace, parseWorkspaceRequestBody, requireFundId } from "@/lib/server/repe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspace = await getRepeWorkspace({
      envId: searchParams.get("env_id") || "a1b2c3d4-0001-0001-0003-000000000001",
      businessId: searchParams.get("business_id"),
      fundId: searchParams.get("fund_id"),
      quarter: searchParams.get("quarter"),
    });
    return NextResponse.json(workspace.latestIcMemo);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "IC memo query failed" },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = parseWorkspaceRequestBody(await request.json());
    const memo = await createIcMemo({
      envId:
        body.envId || "a1b2c3d4-0001-0001-0003-000000000001",
      fundId: requireFundId(body.fundId),
      quarter: body.quarter,
      scenarioId: body.scenarioId,
      modelRunId: body.modelRunId,
      generatedBy: "repe_workspace",
    });
    return NextResponse.json(memo, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "IC memo generation failed" },
      { status: 400 }
    );
  }
}
