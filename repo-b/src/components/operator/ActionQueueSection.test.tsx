import React from "react";
import { render, screen } from "@testing-library/react";
import { ActionQueueSection } from "@/components/operator/ActionQueueSection";
import type { OperatorActionQueueItem } from "@/lib/bos-api";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const ITEM: OperatorActionQueueItem = {
  id: "aq-1",
  rank: 1,
  priority: "critical",
  category: "permit",
  title: "Call Dallas permit office",
  summary: "Airport Expansion electrical rev 3 pending.",
  entity_id: "hb-construction",
  project_id: "airport-expansion",
  site_id: null,
  municipality_id: "muni-dallas",
  triggered_by: { type: "permit_over_median" },
  impact: {
    type: "delay",
    estimated_cost_usd: 125000,
    estimated_delay_days: 21,
    estimated_revenue_at_risk_usd: 0,
    confidence: "high",
    time_to_failure_days: 10,
    if_ignored: {
      in_30_days: {
        estimated_cost_usd: 275000,
        estimated_delay_days: 45,
        secondary_effects: ["Pushes closeout into next quarter"],
      },
    },
  },
  escalation_level: 2,
  owner: "PM — Dallas",
  blocking: true,
  due_window: "this_week",
  href: "/lab/env/e/operator/delivery/airport-expansion",
  action_label: "Call permit office",
};

describe("ActionQueueSection", () => {
  test("renders an if-ignored subline with the 30-day consequence", () => {
    render(<ActionQueueSection items={[ITEM]} collapsedCount={0} />);
    const line = screen.getByTestId("if-ignored");
    expect(line.textContent).toMatch(/if ignored/i);
    expect(line.textContent).toContain("+$275");
    expect(line.textContent).toMatch(/\+45 days/);
    expect(line.textContent).toMatch(/closeout/i);
  });

  test("renders a time-to-failure urgency pill when ttf <= 14", () => {
    render(<ActionQueueSection items={[ITEM]} collapsedCount={0} />);
    expect(screen.getByText(/10d to failure/i)).toBeInTheDocument();
  });

  test("shows '+N lower-priority issues' when collapsedCount > 0", () => {
    render(<ActionQueueSection items={[ITEM]} collapsedCount={12} />);
    expect(
      screen.getByRole("button", { name: /\+12 lower-priority issues/i })
    ).toBeInTheDocument();
  });

  test("does not render the collapsed row when everything fits", () => {
    render(<ActionQueueSection items={[ITEM]} collapsedCount={0} />);
    expect(screen.queryByRole("button", { name: /lower-priority/i })).toBeNull();
  });
});
