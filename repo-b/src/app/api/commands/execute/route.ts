import { NextResponse } from "next/server";
import { executePlanRun } from "@/lib/server/commandOrchestrator";
import {
  createRun,
  getPlan,
  verifyAndConsumeConfirmationToken,
} from "@/lib/server/commandOrchestratorStore";
import { resolveRequestId, traceLog, withRequestId } from "@/lib/server/requestTrace";
import { hasDemoSession } from "@/lib/server/sessionAuth";

export const runtime = "nodejs";

type ExecuteRequest = {
  plan_id?: string;
  confirm_token?: string;
};

export async function POST(request: Request) {
  const requestId = resolveRequestId(request);
  if (!hasDemoSession(request)) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401, ...withRequestId(requestId) });
  }
  const payload = (await request.json().catch(() => ({}))) as ExecuteRequest;
  const planId = String(payload.plan_id || "").trim();
  const confirmToken = String(payload.confirm_token || "").trim();

  if (!planId || !confirmToken) {
    return NextResponse.json(
      { error: "plan_id and confirm_token are required" },
      { status: 400, ...withRequestId(requestId) }
    );
  }

  const plan = getPlan(planId);
  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404, ...withRequestId(requestId) });
  }
  if (plan.clarification?.needed) {
    return NextResponse.json(
      {
        error:
          plan.clarification.reason ||
          "Plan needs clarification and cannot execute yet.",
        clarification: plan.clarification,
      },
      { status: 409, ...withRequestId(requestId) }
    );
  }

  const check = verifyAndConsumeConfirmationToken(planId, confirmToken);
  if (!check.ok) {
    return NextResponse.json({ error: check.error || "Confirmation failed" }, { status: 403, ...withRequestId(requestId) });
  }

  const run = createRun(planId);
  const origin = new URL(request.url).origin;

  void executePlanRun({
    planId,
    runId: run.runId,
    origin,
    requestId,
  });

  traceLog("commands.execute", {
    request_id: requestId,
    plan_id: planId,
    run_id: run.runId,
    status: run.status,
  });

  return NextResponse.json({ run_id: run.runId, status: run.status }, withRequestId(requestId));
}
