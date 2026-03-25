import { describe, expect, it } from "vitest";
import {
  ContractValidationError,
  parseExecuteResponse,
  parsePlanResponse,
  parseRunStatusResponse,
} from "@/lib/commandbar/schemas";

describe("commandbar schemas", () => {
  const planPayload = {
    plan_id: "plan_123",
    risk: "low",
    mutations: [],
    requires_confirmation: true,
    requires_double_confirmation: false,
    double_confirmation_phrase: null,
    plan: {
      planId: "plan_123",
      intentSummary: "List environments",
      intent: {
        rawMessage: "list environments",
        domain: "lab",
        resource: "environments",
        action: "list",
        parameters: {},
        confidence: 0.9,
        readOnly: true,
      },
      operationName: "lab.environments.list",
      operationParams: { envId: "env_1" },
      steps: [
        {
          id: "step_1",
          title: "Read environments",
          description: "Calls list endpoint",
          mutation: false,
        },
      ],
      impactedEntities: ["environments"],
      mutations: [],
      risk: "low",
      readOnly: true,
      requiresConfirmation: true,
      requiresDoubleConfirmation: false,
      doubleConfirmationPhrase: null,
      target: { envId: "env_1", envName: "Acme", businessId: null },
      clarification: { needed: false },
      context: { currentEnvId: "env_1", currentBusinessId: null, route: "/lab/environments", selection: null },
      createdAt: Date.now(),
    },
  };

  it("parses plan response and derives preview diff", () => {
    const parsed = parsePlanResponse("/api/mcp/plan", planPayload);
    expect(parsed.plan.planId).toBe("plan_123");
    expect(parsed.plan.riskLevel).toBe("low");
    expect(parsed.plan.previewDiff.length).toBeGreaterThan(0);
  });

  it("throws on malformed plan response", () => {
    expect(() => parsePlanResponse("/api/mcp/plan", { plan_id: "x" })).toThrow(
      ContractValidationError
    );
  });

  it("parses execute response", () => {
    const parsed = parseExecuteResponse("/api/commands/execute", {
      run_id: "run_123",
      status: "running",
    });
    expect(parsed.runId).toBe("run_123");
    expect(parsed.status).toBe("running");
  });

  it("parses run status payload", () => {
    const payload = {
      run: {
        runId: "run_1",
        planId: "plan_1",
        status: "completed",
        createdAt: Date.now(),
        startedAt: Date.now(),
        endedAt: Date.now(),
        cancelled: false,
        logs: ["Run completed."],
        stepResults: [
          {
            stepId: "step_1",
            status: "completed",
          },
        ],
        verification: [],
      },
      plan: {
        plan_id: "plan_1",
        risk: "low",
        read_only: true,
        intent_summary: "List environments",
        impacted_entities: ["environments"],
        mutations: [],
        target: null,
        clarification: null,
        requires_double_confirmation: false,
        double_confirmation_phrase: null,
      },
      audit_events: [],
    };

    const parsed = parseRunStatusResponse("/api/commands/runs/run_1", payload);
    expect(parsed.run.status).toBe("completed");
  });
});
