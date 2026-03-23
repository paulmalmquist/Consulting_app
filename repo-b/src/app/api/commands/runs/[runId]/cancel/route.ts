import { NextResponse } from "next/server";
import {
  appendAuditEvent,
  appendRunLog,
  cancelRun,
  getPlanForRun,
} from "@/lib/server/commandOrchestratorStore";
import { resolveRequestId, traceLog, withRequestId } from "@/lib/server/requestTrace";
import { hasSession } from "@/lib/server/sessionAuth";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { runId: string } }
) {
  const requestId = resolveRequestId(request);
  if (!hasSession(request)) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401, ...withRequestId(requestId) });
  }
  const { runId } = params;
  const run = cancelRun(runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404, ...withRequestId(requestId) });
  }

  const plan = getPlanForRun(runId);
  appendRunLog(runId, "Cancellation requested by user.");
  if (plan) {
    appendAuditEvent(plan.planId, "run.cancelled", { source: "user.cancel" }, runId);
  }

  traceLog("commands.cancel", {
    request_id: requestId,
    run_id: runId,
    status: run.status,
  });

  return NextResponse.json({ ok: true, run_id: runId, status: run.status }, withRequestId(requestId));
}
