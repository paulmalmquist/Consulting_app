import { NextResponse } from "next/server";
import type { CommandContext } from "@/lib/commandbar/types";
import { buildExecutionPlan, toPlanResponse } from "@/lib/server/commandOrchestrator";
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
  const plan = buildExecutionPlan(message, context);
  storePlan(plan);

  appendAuditEvent(plan.planId, "plan.created", {
    route: context.route || null,
    domain: plan.intent.domain,
    action: plan.intent.action,
    resource: plan.intent.resource,
    risk: plan.risk,
    mutations: plan.mutations,
  });

  return NextResponse.json(toPlanResponse(plan));
}
