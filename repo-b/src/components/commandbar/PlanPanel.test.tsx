import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PlanPanel from "@/components/commandbar/PlanPanel";
import type { AssistantPlan } from "@/lib/commandbar/schemas";

function makePlan(): AssistantPlan {
  return {
    planId: "plan_1",
    intentSummary: "List environments",
    intent: {
      rawMessage: "list environments",
      domain: "lab",
      resource: "environments",
      action: "list",
      parameters: {},
      confidence: 0.93,
      readOnly: true,
    },
    operationName: "lab.environments.list",
    operationParams: { envId: "env_1" },
    steps: [
      {
        id: "step_1",
        title: "Read environments",
        description: "Call read endpoint",
        mutation: false,
      },
    ],
    impactedEntities: ["environments"],
    mutations: [],
    risk: "low",
    riskLevel: "low",
    affectedEntities: ["environments"],
    previewDiff: [{ field: "envId", before: null, after: "env_1", change: "update" }],
    readOnly: true,
    requiresConfirmation: true,
    requiresDoubleConfirmation: false,
    doubleConfirmationPhrase: null,
    target: { envId: "env_1", envName: "Acme", businessId: null },
    clarification: { needed: false },
    context: {
      currentEnvId: "env_1",
      currentBusinessId: null,
      route: "/lab/environments",
      selection: null,
    },
    createdAt: Date.now(),
  };
}

describe("PlanPanel", () => {
  it("renders plan and steps", () => {
    render(
      <PlanPanel
        plan={makePlan()}
        planning={false}
        onNeedConfirm={vi.fn()}
        onReset={vi.fn()}
        onClarificationChoice={vi.fn()}
      />
    );

    expect(screen.getByText("List environments")).toBeInTheDocument();
    expect(screen.getByText(/Read environments/)).toBeInTheDocument();
    expect(screen.getByText("Continue to Confirm")).toBeInTheDocument();
  });

  it("triggers confirmation callback", async () => {
    const user = userEvent.setup();
    const onNeedConfirm = vi.fn();

    render(
      <PlanPanel
        plan={makePlan()}
        planning={false}
        onNeedConfirm={onNeedConfirm}
        onReset={vi.fn()}
        onClarificationChoice={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Continue to Confirm" }));
    expect(onNeedConfirm).toHaveBeenCalledTimes(1);
  });
});
