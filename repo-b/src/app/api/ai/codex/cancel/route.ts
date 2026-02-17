import { NextResponse } from "next/server";
import { cancelRun, appendRunEvent } from "@/lib/server/codexRunStore";
import { isLocalAiEnabled } from "@/lib/server/codexBridge";
import { hasDemoSession, unauthorizedJson } from "@/lib/server/sessionAuth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasDemoSession(request)) {
    return unauthorizedJson();
  }
  if (!isLocalAiEnabled()) {
    return NextResponse.json(
      { error: "Local Codex routes are disabled. Set AI_MODE=local." },
      { status: 403 }
    );
  }

  const payload = (await request.json()) as { runId?: string };
  const runId = payload.runId;
  if (!runId) {
    return NextResponse.json({ error: "runId is required." }, { status: 400 });
  }

  const run = cancelRun(runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  appendRunEvent(runId, {
    type: "final",
    payload: { status: "cancelled" },
    at: Date.now(),
  });

  return NextResponse.json({ ok: true, runId });
}
