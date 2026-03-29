import { NextResponse } from "next/server";
import {
  getPlanForRun,
  getRun,
  listAuditEvents,
} from "@/lib/server/commandOrchestratorStore";
import { resolveRequestId, traceLog, withRequestId } from "@/lib/server/requestTrace";
import { hasSession } from "@/lib/server/sessionAuth";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: { runId: string } }
) {
  const requestId = resolveRequestId(request);
  if (!(await hasSession(request))) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401, ...withRequestId(requestId) });
  }
  const { runId } = params;
  const run = getRun(runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404, ...withRequestId(requestId) });
  }

  const plan = getPlanForRun(runId);
  const auditEvents = plan ? listAuditEvents(plan.planId) : [];

  traceLog("commands.run_status", {
    request_id: requestId,
    run_id: runId,
    status: run.status,
  });

  return NextResponse.json({
    run,
    plan: plan
      ? {
          plan_id: plan.planId,
          risk: plan.risk,
          read_only: plan.readOnly,
          intent_summary: plan.intentSummary,
          impacted_entities: plan.impactedEntities,
          mutations: plan.mutations,
          target: plan.target || null,
          clarification: plan.clarification || null,
          requires_double_confirmation: plan.requiresDoubleConfirmation,
          double_confirmation_phrase: plan.doubleConfirmationPhrase || null,
        }
      : null,
    audit_events: auditEvents,
  }, withRequestId(requestId));
}
