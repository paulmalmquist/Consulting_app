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
    if (!payload.run) {
      return NextResponse.json({ error: "Model run not found" }, { status: 404 });
    }
    return NextResponse.json(payload.run);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Model run lookup failed" },
      { status: 400 }
    );
  }
}
