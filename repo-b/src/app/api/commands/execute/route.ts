import { NextResponse } from "next/server";
import { executePlanRun } from "@/lib/server/commandOrchestrator";
import {
  createRun,
  getPlan,
  verifyAndConsumeConfirmationToken,
} from "@/lib/server/commandOrchestratorStore";

export const runtime = "nodejs";

type ExecuteRequest = {
  plan_id?: string;
  confirm_token?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as ExecuteRequest;
  const planId = String(payload.plan_id || "").trim();
  const confirmToken = String(payload.confirm_token || "").trim();

  if (!planId || !confirmToken) {
    return NextResponse.json(
      { error: "plan_id and confirm_token are required" },
      { status: 400 }
    );
  }

  const plan = getPlan(planId);
  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }
  if (plan.clarification?.needed) {
    return NextResponse.json(
      {
        error:
          plan.clarification.reason ||
          "Plan needs clarification and cannot execute yet.",
        clarification: plan.clarification,
      },
      { status: 409 }
    );
  }

  const check = verifyAndConsumeConfirmationToken(planId, confirmToken);
  if (!check.ok) {
    return NextResponse.json({ error: check.error || "Confirmation failed" }, { status: 403 });
  }

  const run = createRun(planId);
  const origin = new URL(request.url).origin;

  void executePlanRun({
    planId,
    runId: run.runId,
    origin,
  });

  return NextResponse.json({ run_id: run.runId, status: run.status });
}
