import React from "react";
import { render, screen } from "@testing-library/react";

import ExecutiveOverview from "@/components/pds-executive/ExecutiveOverview";

describe("ExecutiveOverview", () => {
  it("renders metrics and buttons", () => {
    render(
      <ExecutiveOverview
        overview={{
          env_id: "env-1",
          business_id: "biz-1",
          grain: "portfolio",
          decisions_total: 20,
          open_queue: 7,
          critical_queue: 2,
          high_queue: 3,
          open_signals: 12,
          high_signals: 4,
          latest_kpi: null,
          metrics: {},
        }}
        loading={false}
        running={false}
        onRunConnectors={async () => {}}
        onRunFull={async () => {}}
      />,
    );

    expect(screen.getByText("PDS Executive Overview")).toBeInTheDocument();
    expect(screen.getByText("Run Connectors")).toBeInTheDocument();
    expect(screen.getByText("Run Full Cycle")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });
});
