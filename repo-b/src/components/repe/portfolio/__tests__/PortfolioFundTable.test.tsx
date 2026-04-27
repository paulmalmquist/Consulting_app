import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PortfolioFundTable } from "@/components/repe/portfolio/PortfolioFundTable";
import { PortfolioFilterProvider } from "@/components/repe/portfolio/PortfolioFilterContext";
import type { FundTableRow, ReV2AuthoritativeState } from "@/lib/bos-api";

// ── Fixture builders ────────────────────────────────────────────────────────

function fundRow(overrides: Partial<FundTableRow> = {}): FundTableRow {
  return {
    fund_id: "mcof-i",
    business_id: "biz-1",
    name: "Meridian Credit Opportunities Fund I",
    vintage_year: 2024,
    fund_type: "open_end",
    strategy: "debt",
    sub_strategy: "CMBS Senior Multifamily",
    target_size: "600000000",
    status: "investing",
    base_currency: "USD",
    inception_date: "2024-01-01",
    created_at: "2024-01-01T00:00:00Z",
    portfolio_nav: "116700000",
    total_committed: "600000000",
    total_called: "120000000",
    total_distributed: null,
    dpi: "0.07",
    rvpi: null,
    tvpi: "1.04",
    gross_irr: "0.024",
    net_irr: "-0.017",
    weighted_dscr: null,
    weighted_ltv: null,
    pct_invested: "0.20",
    ...overrides,
  };
}

function authState(overrides: Partial<ReV2AuthoritativeState> = {}): ReV2AuthoritativeState {
  return {
    entity_type: "fund",
    entity_id: "mcof-i",
    quarter: "2026Q1",
    requested_quarter: "2026Q1",
    period_exact: true,
    state_origin: "authoritative",
    audit_run_id: "ar-1",
    snapshot_version: "meridian-20260410T023425Z-ab1e6999",
    promotion_state: "released",
    trust_status: "trusted",
    breakpoint_layer: null,
    null_reason: null,
    state: {
      period_start: "2026-01-01",
      period_end: "2026-03-31",
      canonical_metrics: {
        total_committed: "600000000",
        total_called: "120000000",
        ending_nav: "116700000",
        gross_irr: "0.024",
        net_irr: "-0.017",
        dpi: "0.07",
        tvpi: "1.04",
        net_tvpi: "0.98",
        scope: {
          investment_count: 7,
          expected_investment_count: 7,
          scope_completeness: "complete",
          scope_contract_version: "v1",
        },
      },
      display_metrics: {},
      gross_to_net_bridge: {
        gross_return_amount: "5000000",
        management_fees: "1500000",
        fund_expenses: "500000",
        net_return_amount: "3000000",
        bridge_items: [],
        formulas: {},
        null_reasons: {},
      },
    },
    null_reasons: {},
    formulas: {},
    provenance: [],
    artifact_paths: {},
    ...overrides,
  };
}

function renderTable(args: {
  rows: FundTableRow[];
  authMap: Map<string, ReV2AuthoritativeState>;
  loading?: boolean;
  error?: string | null;
}) {
  return render(
    <PortfolioFilterProvider>
      <PortfolioFundTable
        rows={args.rows}
        authStatesByFundId={args.authMap}
        loading={args.loading ?? false}
        error={args.error ?? null}
        quarter="2026Q1"
      />
    </PortfolioFilterProvider>,
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("PortfolioFundTable", () => {
  it("renders MCOF I AUM as committed capital, not $0", () => {
    const rows = [fundRow()];
    const map = new Map([["mcof-i", authState()]]);
    renderTable({ rows, authMap: map });
    const aumCell = document.querySelector('[data-metric="aum"]');
    expect(aumCell).not.toBeNull();
    expect(aumCell?.textContent).toContain("$600.0M");
    expect(screen.queryByText("$0")).toBeNull();
  });

  it("renders AUM with 'target' badge when auth not released but target_size present", () => {
    const rows = [fundRow()];
    const draftAuth = authState({ promotion_state: "draft_audit" });
    const map = new Map([["mcof-i", draftAuth]]);
    renderTable({ rows, authMap: map });
    const aumCell = document.querySelector('[data-metric="aum"][data-source="target"]');
    expect(aumCell).not.toBeNull();
    expect(aumCell?.textContent).toContain("$600.0M");
    expect(aumCell?.textContent?.toLowerCase()).toContain("target");
    expect(screen.queryByText("$0")).toBeNull();
  });

  it("renders MCOF I % Invested at 20% when auth has 600M committed and 120M called", () => {
    const rows = [fundRow()];
    const map = new Map([["mcof-i", authState()]]);
    renderTable({ rows, authMap: map });
    const cell = document.querySelector('[data-metric="pct_invested"]');
    expect(cell).not.toBeNull();
    expect(cell?.textContent).toContain("20.0%");
  });

  it("% Invested fails closed when auth not released, never falls back to target_size", () => {
    const rows = [fundRow()];
    const draftAuth = authState({
      promotion_state: "draft_audit",
      state: {
        ...authState().state!,
        canonical_metrics: {
          ...authState().state!.canonical_metrics,
          total_called: null as unknown as string,
        },
      },
    });
    const map = new Map([["mcof-i", draftAuth]]);
    renderTable({ rows, authMap: map });
    expect(screen.queryByText("0%")).toBeNull();
    expect(screen.queryByText("0.0%")).toBeNull();
    expect(screen.queryByText("20.0%")).toBeNull();
    const unavailable = screen.getAllByTestId("unavailable-cell");
    expect(unavailable.length).toBeGreaterThan(0);
    const reasons = unavailable.map((el) => el.getAttribute("data-null-reason"));
    expect(reasons).toContain("authoritative_state_not_released");
  });

  it("renders TrustChip and ScopeBadge in fund-name cell for every row", () => {
    const releasedRow = fundRow({ fund_id: "f-released", name: "Released Fund" });
    const verifiedRow = fundRow({ fund_id: "f-verified", name: "Verified Fund" });
    const missingRow = fundRow({ fund_id: "f-missing", name: "Missing Fund" });
    const releasedAuth = authState({ entity_id: "f-released" });
    const verifiedAuth = authState({ entity_id: "f-verified", promotion_state: "verified" });
    const map = new Map<string, ReV2AuthoritativeState>([
      ["f-released", releasedAuth],
      ["f-verified", verifiedAuth],
    ]);

    renderTable({ rows: [releasedRow, verifiedRow, missingRow], authMap: map });

    expect(screen.getAllByText("released").length).toBeGreaterThan(0);
    expect(screen.getAllByText("verified").length).toBeGreaterThan(0);
    expect(screen.getAllByText("not found").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Scope 7\/7/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Scope —").length).toBeGreaterThan(0);
  });

  it("renders Net IRR with bridge tooltip when value is present", () => {
    const rows = [fundRow()];
    const map = new Map([["mcof-i", authState()]]);
    renderTable({ rows, authMap: map });
    const cell = document.querySelector('[data-metric="net_irr"]');
    expect(cell).not.toBeNull();
    expect(cell?.textContent).toContain("-1.7%");
    const title = cell?.getAttribute("title") ?? "";
    expect(title).toContain("Management fees");
    expect(title).toContain("Gross IRR");
  });

  it("renders UnavailableCell for Net IRR when null_reasons.net_irr === out_of_scope_requires_waterfall", () => {
    const rows = [fundRow()];
    const a = authState({
      null_reasons: { net_irr: "out_of_scope_requires_waterfall" },
    });
    const map = new Map([["mcof-i", a]]);
    renderTable({ rows, authMap: map });
    const cells = screen.getAllByTestId("unavailable-cell");
    const waterfall = cells.find(
      (el) => el.getAttribute("data-null-reason") === "out_of_scope_requires_waterfall",
    );
    expect(waterfall).toBeDefined();
    expect(waterfall?.getAttribute("title")).toContain("waterfall not defined");
  });

  it("splits TVPI into Gross TVPI and Net TVPI columns and avoids ambiguous TVPI", () => {
    const rows = [fundRow()];
    const map = new Map([["mcof-i", authState()]]);
    renderTable({ rows, authMap: map });
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent?.trim() ?? "");
    expect(headers).toContain("Gross TVPI");
    expect(headers).toContain("Net TVPI");
    expect(headers).not.toContain("TVPI");
    expect(document.querySelector('[data-metric="gross_tvpi"]')?.textContent).toContain("1.04x");
    expect(document.querySelector('[data-metric="net_tvpi"]')?.textContent).toContain("0.98x");
  });

  it("does not render an Actions column or row dashes", () => {
    const rows = [fundRow()];
    const map = new Map([["mcof-i", authState()]]);
    renderTable({ rows, authMap: map });
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent?.trim() ?? "");
    expect(headers).not.toContain("Actions");
    const dashOnlyCells = Array.from(document.querySelectorAll("td")).filter(
      (td) => td.textContent?.trim() === "—",
    );
    expect(dashOnlyCells.length).toBe(0);
  });

  it("never renders $0 for AUM when auth says total_committed missing and target_size is null", () => {
    const rows = [fundRow({ target_size: null })];
    const a = authState({
      state: {
        ...authState().state!,
        canonical_metrics: {
          ...authState().state!.canonical_metrics,
          total_committed: null as unknown as string,
        },
      },
      null_reasons: { total_committed: "missing_source" },
    });
    const map = new Map([["mcof-i", a]]);
    renderTable({ rows, authMap: map });
    expect(screen.queryByText(/\$0\b/)).toBeNull();
    const aumUnavailable = screen
      .getAllByTestId("unavailable-cell")
      .find((el) => el.getAttribute("data-null-reason") === "missing_commitment");
    expect(aumUnavailable).toBeDefined();
  });

  it("renders Gross IRR labels distinctly (not bare 'IRR')", () => {
    const rows = [fundRow()];
    const map = new Map([["mcof-i", authState()]]);
    renderTable({ rows, authMap: map });
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent?.trim() ?? "");
    expect(headers).toContain("Gross IRR");
    expect(headers).toContain("Net IRR");
    expect(headers).not.toContain("IRR");
  });
});
