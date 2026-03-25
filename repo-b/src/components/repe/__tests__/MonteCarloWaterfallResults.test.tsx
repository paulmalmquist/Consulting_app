import React from "react";
import { render, screen } from "@testing-library/react";

import { MonteCarloWaterfallResults } from "@/components/repe/model/MonteCarloWaterfallResults";

test("MonteCarloWaterfallResults renders percentile scenarios", () => {
  render(
    <MonteCarloWaterfallResults
      result={{
        p10: { run_id: "1", fund_id: "f", quarter: "2026Q1", summary: { nav: 90_000_000, lp_total: 70_000_000, gp_carry: 5_000_000, net_tvpi: 1.4 } },
        p50: { run_id: "2", fund_id: "f", quarter: "2026Q1", summary: { nav: 100_000_000, lp_total: 80_000_000, gp_carry: 8_000_000, net_tvpi: 1.6 } },
        p90: { run_id: "3", fund_id: "f", quarter: "2026Q1", summary: { nav: 115_000_000, lp_total: 92_000_000, gp_carry: 12_000_000, net_tvpi: 1.9 } },
        deltas: {},
      }}
    />
  );

  expect(screen.getByText("Percentile Waterfalls")).toBeInTheDocument();
  expect(screen.getByText("P10")).toBeInTheDocument();
  expect(screen.getByText("P50")).toBeInTheDocument();
  expect(screen.getByText("P90")).toBeInTheDocument();
});
