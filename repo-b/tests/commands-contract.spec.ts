import { expect, test } from "@playwright/test";
import { parsePlanResponse, parseRunStatusResponse } from "../src/lib/commandbar/schemas";
import type { ContextSnapshot } from "../src/lib/commandbar/types";

test.describe("commands contract", () => {
  test("private endpoints reject unauthenticated requests", async ({ request }) => {
    const snapshotRes = await request.get("/api/mcp/context-snapshot?route=/lab/environments");
    expect(snapshotRes.status()).toBe(401);

    const planRes = await request.post("/api/mcp/plan", {
      data: {
        message: "list environments",
        context: { route: "/lab/environments" },
        contextSnapshot: {},
      },
    });
    expect(planRes.status()).toBe(401);
  });

  test("plan/confirm/execute/run contracts remain stable", async ({ request }) => {
    const authed = { headers: { cookie: "demo_lab_session=active" } };

    const snapshotRes = await request.get("/api/mcp/context-snapshot?route=/lab/environments", authed);
    expect(snapshotRes.ok()).toBeTruthy();
    const snapshot = (await snapshotRes.json()) as ContextSnapshot;

    const planRes = await request.post("/api/mcp/plan", {
      ...authed,
      data: {
        message: "list environments",
        context: { route: "/lab/environments" },
        contextSnapshot: snapshot,
      },
    });
    expect(planRes.ok()).toBeTruthy();
    const planPayload = await planRes.json();
    const parsedPlan = parsePlanResponse("/api/mcp/plan", planPayload);
    expect(parsedPlan.plan.operationName).toBe("lab.environments.list");

    const badExecute = await request.post("/api/commands/execute", {
      ...authed,
      data: { plan_id: parsedPlan.planId, confirm_token: "invalid_token" },
    });
    expect(badExecute.status()).toBe(403);

    const confirmRes = await request.post("/api/commands/confirm", {
      ...authed,
      data: { plan_id: parsedPlan.planId },
    });
    expect(confirmRes.ok()).toBeTruthy();
    const confirmPayload = await confirmRes.json();

    const executeRes = await request.post("/api/commands/execute", {
      ...authed,
      data: { plan_id: parsedPlan.planId, confirm_token: confirmPayload.confirm_token },
    });
    expect(executeRes.ok()).toBeTruthy();
    const executePayload = await executeRes.json();

    let runPayload: unknown = null;
    for (let i = 0; i < 20; i += 1) {
      const runRes = await request.get(`/api/commands/runs/${encodeURIComponent(executePayload.run_id)}`, authed);
      expect(runRes.ok()).toBeTruthy();
      runPayload = await runRes.json();
      const parsed = parseRunStatusResponse("/api/commands/runs/[runId]", runPayload);
      if (parsed.run.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const finalRun = parseRunStatusResponse("/api/commands/runs/[runId]", runPayload);
    expect(["completed", "needs_clarification", "failed"]).toContain(finalRun.run.status);
  });
});
