import { NextResponse } from "next/server";
import { getModelRunPayload } from "@/lib/server/repe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { runId: string } }
) {
  try {
    const payload = await getModelRunPayload(params.runId);
    return NextResponse.json(payload.results);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Model run result lookup failed" },
      { status: 400 }
    );
  }
}
