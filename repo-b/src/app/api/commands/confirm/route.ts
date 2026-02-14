import { NextResponse } from "next/server";
import { applyPlanParameterOverrides, toPlanResponse } from "@/lib/server/commandOrchestrator";
import {
  appendAuditEvent,
  getPlan,
  mintConfirmationToken,
  updatePlan,
} from "@/lib/server/commandOrchestratorStore";

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
  const payload = (await request.json().catch(() => ({}))) as ConfirmRequest;
  const planId = String(payload.plan_id || "").trim();
  if (!planId) {
    return NextResponse.json({ error: "plan_id is required" }, { status: 400 });
  }

  let plan = getPlan(planId);
  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  if (payload.overrides) {
    const nextPlan = applyPlanParameterOverrides(plan, payload.overrides);
    const updated = updatePlan(planId, nextPlan);
    if (!updated) {
      return NextResponse.json({ error: "Failed to update plan" }, { status: 500 });
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
      { status: 409 }
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
        { status: 400 }
      );
    }
  }

  const minted = mintConfirmationToken(planId);
  if (!minted) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  appendAuditEvent(planId, "plan.confirmed", {
    risk: plan.risk,
    target: plan.target || null,
    expires_at: new Date(minted.expiresAt).toISOString(),
  });

  return NextResponse.json({
    confirm_token: minted.token,
    expires_at: new Date(minted.expiresAt).toISOString(),
    plan: toPlanResponse(plan).plan,
  });
}
