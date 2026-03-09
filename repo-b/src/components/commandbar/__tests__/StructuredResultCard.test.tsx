import React from "react";
import { render, screen } from "@testing-library/react";

import StructuredResultCard from "@/components/commandbar/StructuredResultCard";

test("StructuredResultCard renders memo sections with export controls", () => {
  render(
    <StructuredResultCard
      result={{
        result_type: "waterfall_memo",
        card: {
          title: "Waterfall Memo",
          sections: [
            {
              title: "Scenario Assumptions",
              content: "Exit cap moved out 150bps and NOI fell 15%.",
            },
          ],
        },
      }}
    />,
  );

  expect(screen.getByText("Scenario Assumptions")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Copy to Clipboard" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Export .docx" })).toBeInTheDocument();
});

test("StructuredResultCard renders heatmap matrices", () => {
  render(
    <StructuredResultCard
      result={{
        result_type: "sensitivity_matrix",
        card: {
          title: "Sensitivity Matrix",
          heatmap: {
            title: "Cap Rate vs NOI Stress",
            col_headers: ["0", "50"],
            row_headers: ["0", "-0.05"],
            rows: [
              [0.18, 0.16],
              [0.14, 0.12],
            ],
            base_value: 0.18,
          },
        },
      }}
    />,
  );

  expect(screen.getByText("Cap Rate vs NOI Stress")).toBeInTheDocument();
  expect(screen.getByText("-0.05")).toBeInTheDocument();
  expect(screen.getByText("0.18")).toBeInTheDocument();
});

test("StructuredResultCard renders session waterfall runs", () => {
  render(
    <StructuredResultCard
      result={{
        result_type: "session_waterfall_summary",
        card: {
          title: "Session Waterfall Runs",
          session_waterfall_runs: [
            {
              run_id: "run-1",
              scenario_name: "P50 Base",
              quarter: "2026Q1",
              key_metrics: {
                irr: "0.18",
                nav: "$100.0M",
                carry: "$8.0M",
              },
            },
          ],
        },
      }}
    />,
  );

  expect(screen.getByText("Tracked Waterfall Runs")).toBeInTheDocument();
  expect(screen.getByText("P50 Base")).toBeInTheDocument();
  expect(screen.getByText("2026Q1")).toBeInTheDocument();
});
