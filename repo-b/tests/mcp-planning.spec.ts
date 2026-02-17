import { expect, test } from "@playwright/test";
import { __internal, buildExecutionPlan, parseCommandIntent } from "../src/lib/server/commandOrchestrator";
import type { ContextSnapshot } from "../src/lib/commandbar/types";

const baseSnapshot: ContextSnapshot = {
  route: "/lab/chat",
  environments: [
    { env_id: "env_novendor_1", client_name: "Novendor", industry: "website", industry_type: "website" },
    { env_id: "env_acme_1", client_name: "Acme", industry: "legal", industry_type: "legal" },
  ],
  selectedEnv: null,
  business: null,
  modulesAvailable: ["environments", "tasks"],
  recentRuns: [],
};

test("resolves Novendor env id for task command", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/tasks/projects")) {
      return new Response(
        JSON.stringify([{ id: "proj_1", name: "Novendor Projects", key: "NOVENDOR" }]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const plan = await buildExecutionPlan({
      message: 'add task "Ship intake workflow" to the novendor environment projects',
      context: { route: "/lab/chat" },
      contextSnapshot: baseSnapshot,
      baseOrigin: "http://127.0.0.1:3001",
    });
    expect(plan.operationName).toBe("tasks.issues.create");
    expect(plan.target?.envId).toBe("env_novendor_1");
    expect(plan.mutations.join(" ").toLowerCase()).not.toContain("create environment");
  } finally {
    global.fetch = originalFetch;
  }
});

test("returns missing_capability when tasks module is unavailable", async () => {
  const plan = await buildExecutionPlan({
    message: 'add task "Ship intake workflow" to the novendor environment projects',
    context: { route: "/lab/chat" },
    contextSnapshot: {
      ...baseSnapshot,
      modulesAvailable: ["environments"],
    },
    baseOrigin: "http://127.0.0.1:3001",
  });
  expect(plan.clarification?.needed).toBeTruthy();
  expect(plan.clarification?.kind).toBe("missing_capability");
  expect(plan.mutations.length).toBe(0);
});

test("validator rejects mismatched plans", async () => {
  const intent = parseCommandIntent('add task "A" to the novendor environment projects', {
    route: "/lab/chat",
  });
  const result = __internal.validatePlan(intent, {
    planId: "p1",
    intentSummary: "bad",
    intent,
    operationName: "lab.environments.create",
    operationParams: {},
    steps: [],
    impactedEntities: [],
    mutations: ["Create environment"],
    risk: "medium",
    readOnly: false,
    requiresConfirmation: true,
    requiresDoubleConfirmation: false,
    doubleConfirmationPhrase: null,
    target: { envId: "env_acme_1", envName: "Acme" },
    clarification: { needed: false },
    context: {},
    createdAt: Date.now(),
  });
  expect(result?.needed).toBeTruthy();
});

test("integration smoke: context snapshot -> plan -> confirm -> execute -> complete", async ({ request }) => {
  const authed = { headers: { cookie: "demo_lab_session=active" } };
  const snapshotRes = await request.get("/api/mcp/context-snapshot?route=/lab/environments", authed);
  expect(snapshotRes.ok()).toBeTruthy();
  const contextSnapshot = (await snapshotRes.json()) as ContextSnapshot;

  const planRes = await request.post("/api/mcp/plan", {
    ...authed,
    data: {
      message: "list environments",
      context: { route: "/lab/environments" },
      contextSnapshot,
    },
  });
  expect(planRes.ok()).toBeTruthy();
  const planned = await planRes.json();
  expect(planned.plan.operationName).toBe("lab.environments.list");

  const confirmRes = await request.post("/api/commands/confirm", {
    ...authed,
    data: { plan_id: planned.plan_id },
  });
  expect(confirmRes.ok()).toBeTruthy();
  const confirmed = await confirmRes.json();

  const executeRes = await request.post("/api/commands/execute", {
    ...authed,
    data: { plan_id: planned.plan_id, confirm_token: confirmed.confirm_token },
  });
  expect(executeRes.ok()).toBeTruthy();
  const executePayload = await executeRes.json();

  let status = "pending";
  for (let i = 0; i < 20; i += 1) {
    const runRes = await request.get(
      `/api/commands/runs/${encodeURIComponent(executePayload.run_id)}`,
      authed
    );
    expect(runRes.ok()).toBeTruthy();
    const run = await runRes.json();
    status = run.run.status;
    if (status === "completed") break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  expect(status).toBe("completed");
});
