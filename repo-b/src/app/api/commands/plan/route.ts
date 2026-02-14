import { NextResponse } from "next/server";
import type { CommandContext } from "@/lib/commandbar/types";
import {
  buildExecutionPlan,
  resolveExecutionPlanTargets,
  toPlanResponse,
} from "@/lib/server/commandOrchestrator";
import { appendAuditEvent, storePlan } from "@/lib/server/commandOrchestratorStore";

export const runtime = "nodejs";

type PlanRequest = {
  message?: string;
  context?: CommandContext;
};

function normalizeContext(input: CommandContext | undefined): CommandContext {
  return {
    currentEnvId: input?.currentEnvId || null,
    currentBusinessId: input?.currentBusinessId || null,
    route: input?.route || null,
    selection: input?.selection || null,
  };
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as PlanRequest;
  const message = String(payload.message || "").trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const context = normalizeContext(payload.context);
  const basePlan = buildExecutionPlan(message, context);
  const plan = await resolveExecutionPlanTargets(
    basePlan,
    new URL(request.url).origin
  );
  storePlan(plan);

  appendAuditEvent(plan.planId, "plan.created", {
    route: context.route || null,
    message,
    domain: plan.intent.domain,
    action: plan.intent.action,
    resource: plan.intent.resource,
    risk: plan.risk,
    mutations: plan.mutations,
    target: plan.target || null,
    clarification: plan.clarification || null,
  });

  return NextResponse.json(toPlanResponse(plan));
}
