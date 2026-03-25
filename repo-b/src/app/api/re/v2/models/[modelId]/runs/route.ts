import { NextRequest, NextResponse } from "next/server";
import { parseWorkspaceRequestBody, runModelForFund } from "@/lib/server/repe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { modelId: string } }
) {
  try {
    const body = parseWorkspaceRequestBody(await request.json());
    const result = await runModelForFund({
      modelId: params.modelId,
      assumptions: body.assumptions,
      triggeredBy: "repe_workspace",
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Model run failed" },
      { status: 400 }
    );
  }
}
