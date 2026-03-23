import { NextRequest, NextResponse } from "next/server";
import { getRepeWorkspace } from "@/lib/server/repe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspace = await getRepeWorkspace({
      envId: searchParams.get("env_id") || "",
      businessId: searchParams.get("business_id"),
      fundId: searchParams.get("fund_id"),
      quarter: searchParams.get("quarter"),
    });
    return NextResponse.json(workspace.documents);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Document query failed" },
      { status: 400 }
    );
  }
}
