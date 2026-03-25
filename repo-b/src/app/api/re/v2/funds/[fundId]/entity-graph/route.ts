import { NextRequest, NextResponse } from "next/server";
import { getRepeWorkspace } from "@/lib/server/repe";

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
    return NextResponse.json(workspace.entityGraph);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Entity graph query failed" },
      { status: 400 }
    );
  }
}
