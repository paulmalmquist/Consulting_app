import React from "react";
import { render, screen } from "@testing-library/react";

import ResponseBlockRenderer from "@/components/copilot/ResponseBlockRenderer";

test("ResponseBlockRenderer renders chart, table, and confirmation blocks", () => {
  const { rerender } = render(
    <ResponseBlockRenderer
      block={{
        type: "table",
        block_id: "tbl_1",
        title: "Top Assets",
        columns: ["asset", "noi"],
        rows: [{ asset: "Palm Grove", noi: 125000 }],
      }}
    />,
  );

  expect(screen.getByText("Top Assets")).toBeInTheDocument();
  expect(screen.getByText("Palm Grove")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Export CSV" })).toBeInTheDocument();

  rerender(
    <ResponseBlockRenderer
      block={{
        type: "confirmation",
        block_id: "confirm_1",
        action: "create_fund",
        summary: "Create Sun Ridge Income Fund",
        provided_params: { name: "Sun Ridge Income Fund" },
        missing_fields: [],
        confirm_label: "Confirm action",
      }}
    />,
  );

  expect(screen.getByText("Confirmation required")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Confirm action" })).toBeInTheDocument();
});
