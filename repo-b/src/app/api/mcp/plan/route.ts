import { NextResponse } from "next/server";
import type { CommandContext, ContextSnapshot } from "@/lib/commandbar/types";
import { buildExecutionPlan, toPlanResponse } from "@/lib/server/commandOrchestrator";
import { appendAuditEvent, storePlan } from "@/lib/server/commandOrchestratorStore";
import { hasDemoSession, unauthorizedJson } from "@/lib/server/sessionAuth";

export const runtime = "nodejs";

type PlanRequest = {
  message?: string;
  context?: CommandContext;
  contextSnapshot?: ContextSnapshot;
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
  if (!hasDemoSession(request)) {
    return unauthorizedJson();
  }
  const payload = (await request.json().catch(() => ({}))) as PlanRequest;
  const message = String(payload.message || "").trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  if (!payload.contextSnapshot) {
    return NextResponse.json(
      { error: "contextSnapshot is required" },
      { status: 400 }
    );
  }

  const context = normalizeContext(payload.context);
  const origin = new URL(request.url).origin;
  const plan = await buildExecutionPlan({
    message,
    context,
    contextSnapshot: payload.contextSnapshot,
    baseOrigin: origin,
  });

  storePlan(plan);
  appendAuditEvent(plan.planId, "plan.created", {
    route: context.route || null,
    message,
    domain: plan.intent.domain,
    action: plan.intent.action,
    resource: plan.intent.resource,
    risk: plan.risk,
    operation: plan.operationName || null,
    operation_params: plan.operationParams || null,
    mutations: plan.mutations,
    target: plan.target || null,
    clarification: plan.clarification || null,
  });

  return NextResponse.json(toPlanResponse(plan));
}
