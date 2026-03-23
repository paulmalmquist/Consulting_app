import { NextRequest, NextResponse } from "next/server";
import { createScenarioForFund, getRepeWorkspace, parseWorkspaceRequestBody } from "@/lib/server/repe";

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
    return NextResponse.json(workspace.scenarios);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scenario query failed" },
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
    const result = await createScenarioForFund({
      fundId: params.fundId,
      quarter: body.quarter,
      modelId: body.modelId,
      name: body.name,
      description: body.description,
      overrides: body.assumptions,
      scenarioType: "custom",
      createdBy: "repe_workspace",
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scenario creation failed" },
      { status: 400 }
    );
  }
}
