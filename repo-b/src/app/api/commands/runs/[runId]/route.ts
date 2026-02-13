import { NextResponse } from "next/server";
import {
  getPlanForRun,
  getRun,
  listAuditEvents,
} from "@/lib/server/commandOrchestratorStore";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: { runId: string } }
) {
  const { runId } = params;
  const run = getRun(runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const plan = getPlanForRun(runId);
  const auditEvents = plan ? listAuditEvents(plan.planId) : [];

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
          requires_double_confirmation: plan.requiresDoubleConfirmation,
          double_confirmation_phrase: plan.doubleConfirmationPhrase || null,
        }
      : null,
    audit_events: auditEvents,
  });
}
