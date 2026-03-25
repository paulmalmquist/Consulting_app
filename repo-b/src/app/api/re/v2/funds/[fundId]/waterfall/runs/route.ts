import { NextRequest, NextResponse } from "next/server";
import { getRepeWorkspace, parseWorkspaceRequestBody, runWaterfallForFund } from "@/lib/server/repe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { fundId: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const workspace = await getRepeWorkspace({
      envId: searchParams.get("env_id") || "a1b2c3d4-0001-0001-0003-000000000001",
      businessId: searchParams.get("business_id"),
      fundId: params.fundId,
      quarter: searchParams.get("quarter"),
    });
    return NextResponse.json({
      runs: workspace.waterfallRuns,
      latest_results: workspace.latestWaterfallResults,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Waterfall query failed" },
      { status: 400 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { fundId: string } }
) {
  try {
    const body = parseWorkspaceRequestBody(await request.json());
    const result = await runWaterfallForFund({
      fundId: params.fundId,
      quarter: body.quarter,
      scenarioId: body.scenarioId,
      totalDistributable: body.totalDistributable,
      runType: body.runType,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Waterfall run failed" },
      { status: 400 }
    );
  }
}
