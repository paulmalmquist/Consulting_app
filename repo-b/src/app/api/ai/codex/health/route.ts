import { NextResponse } from "next/server";
import { checkSidecarHealth } from "@/lib/server/codexBridge";
import { resolveRequestId, traceLog, withRequestId } from "@/lib/server/requestTrace";
import { hasDemoSession } from "@/lib/server/sessionAuth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = resolveRequestId(request);
  if (!hasDemoSession(request)) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401, ...withRequestId(requestId) });
  }
  const health = await checkSidecarHealth();
  traceLog("codex.health", {
    request_id: requestId,
    ok: health.ok,
    mode: health.mode || null,
  });
  return NextResponse.json(health, withRequestId(requestId));
}
