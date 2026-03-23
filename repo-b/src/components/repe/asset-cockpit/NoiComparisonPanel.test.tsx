import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NoiComparisonPanel from "@/components/repe/asset-cockpit/NoiComparisonPanel";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

describe("NoiComparisonPanel", () => {
  test("renders controls and reveals balance overlays", async () => {
    const user = userEvent.setup();

    render(
      <NoiComparisonPanel
        entityType="investment"
        entityId="investment-123"
        entityName="Meridian Office Tower"
        actualNoiAnnual={18_000_000}
        assetValue={51_800_000}
        loanBalance={23_000_000}
        startDate="2019-03-01"
        selectedScenarioLabel="Downside"
      />,
    );

    expect(screen.getByText("NOI Over Time")).toBeInTheDocument();
    expect(screen.getByLabelText("Comparison Mode")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quarterly" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Balance Sheet Metrics" }));

    expect(screen.getByTestId("balance-metric-controls")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Asset Value" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Loan Balance" })).toBeInTheDocument();
  });

  test("switches comparison mode and keeps summary cards visible", async () => {
    const user = userEvent.setup();

    render(
      <NoiComparisonPanel
        entityType="investment"
        entityId="investment-456"
        entityName="Meridian Office Tower"
        actualNoiAnnual={18_000_000}
        assetValue={51_800_000}
        loanBalance={23_000_000}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Comparison Mode"), "budget");

    expect(screen.getByTestId("variance-card")).toBeInTheDocument();
    expect(screen.getByText("Average NOI")).toBeInTheDocument();
    expect(screen.getByText("YoY NOI Growth")).toBeInTheDocument();
  });
});
