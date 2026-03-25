import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import DecisionQueue from "@/components/pds-executive/DecisionQueue";

describe("DecisionQueue", () => {
  it("fires action callback", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn(async () => {});

    render(
      <DecisionQueue
        loading={false}
        items={[
          {
            queue_item_id: "q1",
            env_id: "env-1",
            business_id: "biz-1",
            decision_code: "D07",
            title: "Escalate project",
            summary: "Budget overrun",
            priority: "high",
            status: "open",
            project_id: null,
            signal_event_id: null,
            recommended_action: "Escalate",
            recommended_owner: "Exec",
            due_at: null,
            risk_score: "7",
            context_json: {},
            ai_analysis_json: {},
            input_snapshot_json: {},
            outcome_json: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]}
        onSelect={() => {}}
        onAction={onAction}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
