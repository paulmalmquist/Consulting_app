import { NextRequest, NextResponse } from "next/server";
import { getRepeWorkspace } from "@/lib/server/repe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fundId = searchParams.get("fund_id") || searchParams.get("fundId");
    const workspace = await getRepeWorkspace({
      envId: searchParams.get("env_id") || "a1b2c3d4-0001-0001-0003-000000000001",
      businessId: searchParams.get("business_id"),
      fundId,
      quarter: searchParams.get("quarter") || searchParams.get("asof"),
    });
    return NextResponse.json(workspace.uwVsActual);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "UW vs actual query failed" },
      { status: 400 }
    );
  }
}
