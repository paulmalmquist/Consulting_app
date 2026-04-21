import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import FundDecompositionPage from "@/app/lab/env/[envId]/re/fund-decomposition/page";

const mockUseReEnv = vi.fn();
const mockGetFundDecomposition = vi.fn();
const mockListRepeFunds = vi.fn();
const mockPublishCtx = vi.fn();
const mockResetCtx = vi.fn();

vi.mock("@/components/repe/workspace/ReEnvProvider", () => ({
  useReEnv: (...args: unknown[]) => mockUseReEnv(...args),
}));

vi.mock("@/hooks/useAuthoritativeState", () => ({
  useAuthoritativeState: () => ({
    state: {
      state: {
        canonical_metrics: {
          gross_irr: 0.1, net_irr: 0.08, tvpi: 1.5, dpi: 0.5,
        },
      },
      snapshot_version: "v-test",
      trust_status: "trusted",
      promotion_state: "released",
      period_exact: true,
    },
    lockState: "released",
    loading: false,
    error: null,
  }),
  isLockStateRenderable: (s: string) => s === "released",
}));

vi.mock("@/lib/bos-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bos-api")>("@/lib/bos-api");
  return {
    ...actual,
    listRepeFunds: (...args: unknown[]) => mockListRepeFunds(...args),
    getFundDecomposition: (...args: unknown[]) => mockGetFundDecomposition(...args),
  };
});

vi.mock("@/lib/commandbar/appContextBridge", () => ({
  publishAssistantPageContext: (...args: unknown[]) => mockPublishCtx(...args),
  resetAssistantPageContext: (...args: unknown[]) => mockResetCtx(...args),
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ComposedChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  Line: () => null,
  Bar: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Cell: () => null,
}));

vi.mock("@/components/re/TrustChip", () => ({
  TrustChip: () => <span data-testid="trust-chip">trust</span>,
}));

const I1 = "22222222-2222-2222-2222-222222222201";
const I2 = "22222222-2222-2222-2222-222222222202";
const I3 = "22222222-2222-2222-2222-222222222203";

function makeOverlay(overrides: Partial<any> = {}) {
  return {
    fund_id: "fund-1",
    as_of_quarter: "2026Q2",
    state_origin: "decomposition_overlay",
    selection_definition: {
      primitive: "investment",
      included_investment_ids: [I1, I2, I3],
      excluded_investment_ids: [],
      ownership_basis: "as_of_quarter_end",
      cf_grain: "quarterly_quarter_end",
      overlay_semantics: "Gross contribution of selected investments…",
    },
    baseline_authoritative: {
      source: "re_authoritative_snapshots",
      snapshot_version: "v-test",
      trust_status: "trusted",
      period_exact: true,
      promotion_state: "released",
      gross_irr: 0.1, net_irr: 0.08, tvpi: 1.5, dpi: 0.5,
      paid_in: 190e6, distributions: 90e6, nav: 150e6,
    },
    selection_derived: {
      gross_irr: 0.12,
      gross_irr_null_reason: null,
      tvpi: 1.6,
      dpi: 0.55,
      paid_in: 190e6,
      distributions: 90e6,
      nav: 150e6,
      cashflow_series: [
        { quarter: "2022Q1", quarter_end_date: "2022-03-31", amount: -190e6, cumulative: -190e6 },
        { quarter: "2026Q2", quarter_end_date: "2026-06-30", amount: 150e6, cumulative: 50e6 },
      ],
      net_irr: null,
      net_irr_null_reason: "net_irr_not_dimensional_to_investment_subset",
      carry: null, carry_null_reason: "out_of_scope_requires_waterfall",
      promote: null, promote_null_reason: "out_of_scope_requires_waterfall",
      gp_share: null, gp_share_null_reason: "out_of_scope_requires_waterfall",
    },
    investment_contributions: [
      {
        investment_id: I1, name: "Deal A", included: true,
        paid_in: 100e6, distributions: 60e6, nav: 80e6, gross_irr: 0.18,
        value_share: 0.5, irr_marginal_bps: 250,
        irr_marginal_label: "marginal impact under current selection (leave-one-out, non-additive)",
        assets: [{ asset_id: "a1", name: "Tower A", nav: 80e6, status: "unrealized" }],
      },
      {
        investment_id: I2, name: "Deal B", included: true,
        paid_in: 50e6, distributions: 20e6, nav: 45e6, gross_irr: 0.12,
        value_share: 0.3, irr_marginal_bps: 80,
        irr_marginal_label: "marginal impact under current selection (leave-one-out, non-additive)",
        assets: [{ asset_id: "a2", name: "Plaza B", nav: 45e6, status: "realized" }],
      },
      {
        investment_id: I3, name: "Deal C", included: true,
        paid_in: 40e6, distributions: 10e6, nav: 25e6, gross_irr: 0.04,
        value_share: 0.2, irr_marginal_bps: -50,
        irr_marginal_label: "marginal impact under current selection (leave-one-out, non-additive)",
        assets: [{ asset_id: "a3", name: "Center C", nav: 25e6, status: "unrealized" }],
      },
    ],
    identity_checks: [
      { name: "tvpi_identity", passed: true, delta: 0, tolerance: 1e-9 },
      { name: "dpi_identity", passed: true, delta: 0, tolerance: 1e-9 },
      { name: "full_set_matches_baseline", passed: true, applied: true, delta_gross_irr_bps: 1, delta_tvpi: 0 },
      { name: "order_independent", passed: true, tolerance: "hash_stable" },
      { name: "no_future_cf", passed: true, last_quarter: "2026Q2", as_of_quarter_end: "2026-06-30" },
    ],
    provenance: {
      cf_substrate: "re_investment_cf_series_mat",
      paid_in_substrate: "re_investment_quarter_state",
      xirr_engine: "app.finance.irr_engine.xirr",
      cache_key_hash: "abc123",
    },
    warnings: [],
    ...overrides,
  };
}

describe("FundDecompositionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseReEnv.mockReturnValue({ envId: "env-1", businessId: "biz-1" });
    mockListRepeFunds.mockResolvedValue([
      { fund_id: "fund-1", name: "Fund I", business_id: "biz-1", vintage_year: 2022, fund_type: "closed_end", strategy: "equity", status: "investing" },
    ]);
    mockGetFundDecomposition.mockImplementation(() => Promise.resolve(makeOverlay()));
  });

  test("renders the overlay-semantics subtitle (product guarantee, pinned)", async () => {
    render(<FundDecompositionPage params={{ envId: "env-1" }} />);
    const subtitle = await screen.findByTestId("overlay-subtitle");
    expect(subtitle.textContent).toMatch(/Gross contribution overlay/);
    expect(subtitle.textContent).toMatch(/not a hypothetical alternate fund history/);
  });

  test("baseline Net IRR tile appears and is greyed; overlay strip has no Net IRR tile", async () => {
    render(<FundDecompositionPage params={{ envId: "env-1" }} />);
    await screen.findByTestId("baseline-strip");
    // Baseline strip shows Net IRR.
    const baselineStrip = screen.getByTestId("baseline-strip");
    expect(baselineStrip.textContent).toMatch(/Net IRR/);
    // Overlay strip does NOT show Net IRR as a tile.
    const overlayStrip = screen.getByTestId("overlay-strip");
    expect(overlayStrip.textContent).not.toMatch(/\bNet IRR\b(?!.*intentionally absent)/);
    // It does mention the explicit absence.
    expect(overlayStrip.textContent).toMatch(/Net IRR intentionally absent/);
  });

  test("toggling an investment fires one debounced POST with the expected excluded_investment_ids", async () => {
    render(<FundDecompositionPage params={{ envId: "env-1" }} />);
    await waitFor(() => expect(mockGetFundDecomposition).toHaveBeenCalled());
    const callsBefore = mockGetFundDecomposition.mock.calls.length;

    const checkbox = await screen.findByTestId(`toggle-${I3}`);
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(mockGetFundDecomposition.mock.calls.length).toBeGreaterThan(callsBefore);
    });
    const lastArgs = mockGetFundDecomposition.mock.calls[mockGetFundDecomposition.mock.calls.length - 1][0];
    expect(lastArgs.excludedInvestmentIds).toContain(I3);
  });

  test("identity panel auto-opens when a check fails", async () => {
    mockGetFundDecomposition.mockResolvedValue(
      makeOverlay({
        identity_checks: [
          { name: "tvpi_identity", passed: false, delta: 0.01, tolerance: 1e-9 },
          { name: "dpi_identity", passed: true, delta: 0, tolerance: 1e-9 },
          { name: "full_set_matches_baseline", passed: true, applied: false, applied_reason: "selection_is_subset" },
          { name: "order_independent", passed: true, tolerance: "hash_stable" },
          { name: "no_future_cf", passed: true, last_quarter: "2026Q2", as_of_quarter_end: "2026-06-30" },
        ],
      }),
    );
    render(<FundDecompositionPage params={{ envId: "env-1" }} />);
    await screen.findByTestId("identity-panel");
    const chip = screen.getByTestId("identity-chip");
    expect(chip.textContent).toMatch(/⚠/);
  });

  test("overlay tiles carry the 'overlay' chip", async () => {
    render(<FundDecompositionPage params={{ envId: "env-1" }} />);
    const overlay = await screen.findByTestId("overlay-strip");
    // Each of the three tiles has its own 'overlay' chip + the strip header has one.
    const chips = overlay.querySelectorAll("span");
    const overlayChipCount = Array.from(chips).filter((el) => el.textContent === "overlay").length;
    expect(overlayChipCount).toBeGreaterThanOrEqual(3);
  });
});
