import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import AssetContributionTable from "@/components/repe/portfolio/AssetContributionTable";
import type { ReV2FundInvestmentRollupRow } from "@/lib/bos-api";

function inv(overrides: Partial<ReV2FundInvestmentRollupRow> = {}): ReV2FundInvestmentRollupRow {
  return {
    investment_id: overrides.investment_id ?? "inv-1",
    name: overrides.name ?? "Investment",
    fund_nav_contribution: 100_000_000,
    invested_capital: 80_000_000,
    gross_irr: 0.14,
    sector_mix: { Office: 1 },
    primary_market: "New York",
    ...overrides,
  };
}

describe("AssetContributionTable", () => {
  it("renders a row per investment with NAV %, IRR, and chips", () => {
    const rollup = [
      inv({ investment_id: "a", name: "Asset A", fund_nav_contribution: 600_000_000, gross_irr: 0.18 }),
      inv({ investment_id: "b", name: "Asset B", fund_nav_contribution: 400_000_000, gross_irr: 0.09 }),
    ];
    render(<AssetContributionTable rollup={rollup} totalFundNav={1_000_000_000} envId="env-1" />);
    expect(screen.getByText("Asset A")).toBeInTheDocument();
    expect(screen.getByText("Asset B")).toBeInTheDocument();
    expect(screen.getByText("60.0%")).toBeInTheDocument();
    expect(screen.getByText("40.0%")).toBeInTheDocument();
    expect(screen.getByText("18.0%")).toBeInTheDocument();
    expect(screen.getByText("9.0%")).toBeInTheDocument();
    expect(screen.getAllByText("Performing").length).toBeGreaterThan(0);
  });

  it("sorts descending by NAV by default (top row is largest)", () => {
    const rollup = [
      inv({ investment_id: "small", name: "Small", fund_nav_contribution: 50_000_000 }),
      inv({ investment_id: "big", name: "Big", fund_nav_contribution: 500_000_000 }),
      inv({ investment_id: "mid", name: "Mid", fund_nav_contribution: 200_000_000 }),
    ];
    render(<AssetContributionTable rollup={rollup} envId="env-1" />);
    const firstDataRow = screen.getAllByRole("row")[1];
    expect(within(firstDataRow).getByText("Big")).toBeInTheDocument();
  });

  it("toggles IRR sort direction when the Asset IRR header is clicked twice", () => {
    const rollup = [
      inv({ investment_id: "low", name: "Low IRR", gross_irr: 0.05, fund_nav_contribution: 100 }),
      inv({ investment_id: "mid", name: "Mid IRR", gross_irr: 0.1, fund_nav_contribution: 100 }),
      inv({ investment_id: "high", name: "High IRR", gross_irr: 0.2, fund_nav_contribution: 100 }),
    ];
    render(<AssetContributionTable rollup={rollup} envId="env-1" />);
    const irrHeader = screen.getByTestId("sort-asset-irr");
    fireEvent.click(irrHeader);
    let firstDataRow = screen.getAllByRole("row")[1];
    expect(within(firstDataRow).getByText("High IRR")).toBeInTheDocument();
    fireEvent.click(irrHeader);
    firstDataRow = screen.getAllByRole("row")[1];
    expect(within(firstDataRow).getByText("Low IRR")).toBeInTheDocument();
  });

  it("assigns Underperforming chip when IRR is below target band", () => {
    const rollup = [
      inv({ investment_id: "bad", name: "Laggard", gross_irr: 0.05 }),
      inv({ investment_id: "ok", name: "Steady", gross_irr: 0.13 }),
    ];
    render(<AssetContributionTable rollup={rollup} targetIrr={0.12} envId="env-1" />);
    expect(screen.getByText("Underperforming")).toBeInTheDocument();
    expect(screen.getByText("Performing")).toBeInTheDocument();
  });

  it("renders business-meaningful null reasons — never 'No data' / 'N/A' / 'Pending'", () => {
    const rollup = [
      inv({ investment_id: "sparse", name: "Sparse", fund_nav_contribution: undefined, invested_capital: undefined, gross_irr: undefined, net_irr: undefined }),
    ];
    render(<AssetContributionTable rollup={rollup} envId="env-1" />);
    expect(screen.queryByText(/no data|n\/a|pending/i)).toBeNull();
    // Contribution + Realized/Unrealized always render the attribution-engine reason.
    expect(screen.getAllByText("Awaiting attribution engine").length).toBeGreaterThan(0);
  });

  it("hides archived investments outside audit mode and shows them in audit mode", () => {
    const rollup = [
      inv({ investment_id: "live", name: "Live" }),
      { ...inv({ investment_id: "old", name: "Archived" }), is_archived: true } as ReV2FundInvestmentRollupRow,
    ];
    const { rerender } = render(
      <AssetContributionTable rollup={rollup} envId="env-1" auditMode={false} />
    );
    expect(screen.queryByText("Archived")).toBeNull();
    rerender(<AssetContributionTable rollup={rollup} envId="env-1" auditMode={true} />);
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("renders a trust chip for every row (defaults to Modeled)", () => {
    const rollup = [
      inv({ investment_id: "a", name: "Asset A" }),
      inv({ investment_id: "b", name: "Asset B", stage: "realized" }),
    ];
    render(<AssetContributionTable rollup={rollup} envId="env-1" />);
    expect(screen.getByTestId("trust-chip-a")).toHaveTextContent("Modeled");
    expect(screen.getByTestId("trust-chip-b")).toHaveTextContent("Realized");
  });

  it("renders snapshot version for audit provenance when provided", () => {
    render(<AssetContributionTable rollup={[inv()]} envId="env-1" snapshotVersion="v2025.12.31" />);
    expect(screen.getByText("v2025.12.31")).toBeInTheDocument();
  });
});
