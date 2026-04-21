import { describe, it, expect } from "vitest";
import { bucketForActionView, toActionViewColumns } from "./board";
import type { ExecutionCard } from "@/lib/cro-api";

function card(over: Partial<ExecutionCard>): ExecutionCard {
  return {
    crm_opportunity_id: "o1",
    crm_account_id: null,
    name: "Deal",
    amount: 1000,
    status: "open",
    account_name: "Acct",
    industry: null,
    stage_key: "engaged",
    stage_label: "Engaged",
    win_probability: 0.3,
    contact_name: null,
    expected_close_date: null,
    created_at: new Date().toISOString(),
    last_activity_at: null,
    next_action_description: "do a thing",
    next_action_due: null,
    next_action_type: "task",
    execution_column_key: "engaged",
    execution_column_label: "Engaged",
    personas: [],
    pain_hypothesis: null,
    value_prop: null,
    demo_angle: null,
    priority_score: 50,
    engagement_summary: null,
    execution_pressure: "medium",
    momentum_status: "flat",
    risk_flags: [],
    deal_drift_status: "stable",
    latest_angle_used: null,
    latest_objection: null,
    ranked_next_actions: [],
    stage_suggestions: [],
    auto_draft_stack: {},
    execution_state: {},
    narrative_memory: {},
    ...over,
  } as ExecutionCard;
}

function localIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("bucketForActionView", () => {
  const now = new Date();
  const todayIso = localIso(now);
  const yesterdayIso = localIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const tomorrowIso = localIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));

  it("puts snoozed deals in blocked", () => {
    expect(bucketForActionView(card({ risk_flags: ["snoozed"] }))).toBe("blocked");
  });

  it("puts declining momentum in waiting", () => {
    expect(bucketForActionView(card({ momentum_status: "declining" }))).toBe("waiting");
  });

  it("puts overdue dates in overdue", () => {
    expect(bucketForActionView(card({ next_action_due: yesterdayIso }))).toBe("overdue");
  });

  it("puts today in today", () => {
    expect(bucketForActionView(card({ next_action_due: todayIso }))).toBe("today");
  });

  it("puts tomorrow in this_week", () => {
    expect(bucketForActionView(card({ next_action_due: tomorrowIso }))).toBe("this_week");
  });

  it("treats missing action as overdue when risk flag says so", () => {
    expect(
      bucketForActionView(
        card({
          next_action_description: null,
          next_action_due: null,
          risk_flags: ["no_next_action"],
        }),
      ),
    ).toBe("overdue");
  });
});

describe("toActionViewColumns", () => {
  const now = new Date();
  const todayIso = localIso(now);
  const yesterdayIso = localIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));

  it("groups cards into the 5 action buckets and drops closed stages", () => {
    const columns = [
      {
        execution_column_key: "engaged",
        execution_column_label: "Engaged",
        cards: [
          card({ crm_opportunity_id: "a", next_action_due: todayIso }),
          card({ crm_opportunity_id: "b", next_action_due: yesterdayIso }),
          card({ crm_opportunity_id: "c", risk_flags: ["snoozed"] }),
        ],
        total_value: 3,
        weighted_value: 1,
      },
      {
        execution_column_key: "closed_won",
        execution_column_label: "Won",
        cards: [card({ crm_opportunity_id: "z" })],
        total_value: 1,
        weighted_value: 1,
      },
    ];
    const out = toActionViewColumns(columns);
    const byKey = Object.fromEntries(out.map((c) => [c.execution_column_key, c.cards.map((cc) => cc.crm_opportunity_id)]));
    expect(byKey.today).toContain("a");
    expect(byKey.overdue).toContain("b");
    expect(byKey.blocked).toContain("c");
    // Closed stage dropped
    expect(out.flatMap((c) => c.cards.map((cc) => cc.crm_opportunity_id))).not.toContain("z");
  });
});
