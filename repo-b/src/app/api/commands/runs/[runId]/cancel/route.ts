import { NextResponse } from "next/server";
import {
  appendAuditEvent,
  appendRunLog,
  cancelRun,
  getPlanForRun,
} from "@/lib/server/commandOrchestratorStore";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: { runId: string } }
) {
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
