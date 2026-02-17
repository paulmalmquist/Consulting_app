import { NextResponse } from "next/server";
import {
  appendAuditEvent,
  appendRunLog,
  cancelRun,
  getPlanForRun,
} from "@/lib/server/commandOrchestratorStore";
import { hasDemoSession, unauthorizedJson } from "@/lib/server/sessionAuth";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { runId: string } }
) {
  if (!hasDemoSession(request)) {
    return unauthorizedJson();
  }
  const { runId } = params;
  const run = cancelRun(runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const plan = getPlanForRun(runId);
  appendRunLog(runId, "Cancellation requested by user.");
  if (plan) {
    appendAuditEvent(plan.planId, "run.cancelled", { source: "user.cancel" }, runId);
  }

  return NextResponse.json({ ok: true, run_id: runId, status: run.status });
}
