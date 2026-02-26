import { NextResponse } from "next/server";
import { applyPlanParameterOverrides, toPlanResponse } from "@/lib/server/commandOrchestrator";
import {
  appendAuditEvent,
  getPlan,
  mintConfirmationToken,
  updatePlan,
} from "@/lib/server/commandOrchestratorStore";
import { resolveRequestId, traceLog, withRequestId } from "@/lib/server/requestTrace";
import { hasDemoSession } from "@/lib/server/sessionAuth";

export const runtime = "nodejs";

type ConfirmRequest = {
  plan_id?: string;
  confirmation_text?: string;
  overrides?: {
    envId?: string | null;
    businessId?: string | null;
    name?: string | null;
    industry?: string | null;
    notes?: string | null;
  };
};

export async function POST(request: Request) {
  const requestId = resolveRequestId(request);
  if (!hasDemoSession(request)) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401, ...withRequestId(requestId) });
  }
  const payload = (await request.json().catch(() => ({}))) as ConfirmRequest;
  const planId = String(payload.plan_id || "").trim();
  if (!planId) {
    return NextResponse.json({ error: "plan_id is required" }, { status: 400, ...withRequestId(requestId) });
  }

  let plan = getPlan(planId);
  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404, ...withRequestId(requestId) });
  }

  if (payload.overrides) {
    const nextPlan = applyPlanParameterOverrides(plan, payload.overrides);
    const updated = updatePlan(planId, nextPlan);
    if (!updated) {
      return NextResponse.json({ error: "Failed to update plan" }, { status: 500, ...withRequestId(requestId) });
    }
    plan = updated;
  }

  if (plan.clarification?.needed) {
    return NextResponse.json(
      {
        error:
          plan.clarification.reason ||
          "Plan requires clarification before it can be confirmed.",
        clarification: plan.clarification,
      },
      { status: 409, ...withRequestId(requestId) }
    );
  }

  if (plan.requiresDoubleConfirmation) {
    const typed = String(payload.confirmation_text || "").trim();
    const required = plan.doubleConfirmationPhrase || "DELETE";
    if (typed !== required) {
      return NextResponse.json(
        {
          error: `High-risk plan requires confirmation text: ${required}`,
          required_confirmation_text: required,
        },
        { status: 400, ...withRequestId(requestId) }
      );
    }
  }

  const minted = mintConfirmationToken(planId);
  if (!minted) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404, ...withRequestId(requestId) });
  }

  appendAuditEvent(planId, "plan.confirmed", {
    risk: plan.risk,
    target: plan.target || null,
    expires_at: new Date(minted.expiresAt).toISOString(),
  });

  traceLog("commands.confirm", {
    request_id: requestId,
    plan_id: planId,
    risk: plan.risk,
    expires_at: new Date(minted.expiresAt).toISOString(),
  });

  return NextResponse.json({
    confirm_token: minted.token,
    expires_at: new Date(minted.expiresAt).toISOString(),
    plan: toPlanResponse(plan).plan,
  }, withRequestId(requestId));
}
