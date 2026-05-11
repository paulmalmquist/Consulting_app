import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import TradingAnalyticsWorkbench from "@/components/trading-analytics/TradingAnalyticsWorkbench";
import {
  askTradingCopilot,
  createTradingMemo,
  getTradingAnalogs,
  getTradingCorrelation,
  getTradingHealth,
  getTradingSeasonality,
  getTradingSeries,
  listTradingMemos,
  runTradingRegression,
  runTradingScenario,
  type TradingMemosResponse,
} from "@/lib/trading-api";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="chart">{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => <div />,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => <div />,
  CartesianGrid: () => <div />,
  Legend: () => <div />,
  Tooltip: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
}));

vi.mock("@/lib/trading-api", () => ({
  askTradingCopilot: vi.fn(),
  createTradingMemo: vi.fn(),
  getTradingAnalogs: vi.fn(),
  getTradingCorrelation: vi.fn(),
  getTradingHealth: vi.fn(),
  getTradingSeasonality: vi.fn(),
  getTradingSeries: vi.fn(),
  listTradingMemos: vi.fn(),
  runTradingRegression: vi.fn(),
  runTradingScenario: vi.fn(),
}));

const health = {
  available: true,
  env_id: "env-trading",
  source_mode: "demo_fixture:v1",
  freshness: { series_source: "demo_fixture:v1", latest_observation_date: "2026-05-08", staleness_status: "fresh" },
  layers: [
    { name: "Bronze", definition: "Raw rows", status: "available", row_count: 15660 },
    { name: "Silver", definition: "Aligned rows", status: "available", row_count: 1566 },
    { name: "Gold", definition: "Analytics readiness", status: "available", feature_rows: 46470, analytics_run_count: 8, memo_count: 1 },
  ],
  series: [
    { symbol: "WTI", label: "WTI crude oil", available: true, row_count: 1566, missing_values: 0, date_range: { start: "2020-05-08", end: "2026-05-08" }, latest_value: 72.11, unit: "USD/bbl", source: "demo_fixture:v1", staleness_status: "fresh" },
  ],
  market_overview: [
    { symbol: "WTI", label: "WTI crude oil", value: 72.11, unit: "USD/bbl", source: "demo_fixture:v1", available: true },
    { symbol: "BRENT", label: "Brent crude oil", value: 76.2, unit: "USD/bbl", source: "demo_fixture:v1", available: true },
    { symbol: "HH_GAS", label: "Henry Hub", value: 3.44, unit: "USD/MMBtu", source: "demo_fixture:v1", available: true },
  ],
  unavailable_sources: [],
};

const seasonality = {
  available: true,
  env_id: "env-trading",
  symbol: "HH_GAS",
  label: "Henry Hub",
  lookback_years: 5,
  prior_years: [2021, 2022, 2023, 2024, 2025],
  current_year: 2026,
  date_range: { start: "2020-05-08", end: "2026-05-08" },
  latest: { date: "2026-05-08", value: 3.44, unit: "USD/MMBtu", seasonal_percentile: 62.5 },
  chart: [{ date: "2026-01-02", day_of_year: 2, current: 3.1, historical_avg: 3.0, p10: 2.4, p90: 3.6 }],
  source: { series_source: "demo_fixture:v1" },
  warnings: [],
  run_id: "run-seasonality",
};

const correlation = {
  available: true,
  env_id: "env-trading",
  symbol_a: "WTI",
  symbol_b: "BRENT",
  window_days: 60,
  n_obs: 1500,
  date_range: { start: "2020-05-08", end: "2026-05-08" },
  chart: [{ date: "2026-05-08", correlation: 0.82 }],
  stats: { latest: 0.82, average: 0.73, min: 0.41, max: 0.94 },
  source: { series_source: "demo_fixture:v1" },
  warnings: [],
  run_id: "run-corr",
};

const regression = {
  available: true,
  env_id: "env-trading",
  dependent_symbol: "WTI",
  factor_symbols: ["DXY_PROXY", "UST10Y", "VIX", "CRUDE_INVENTORY_PROXY"],
  lookback_days: 756,
  n_obs: 756,
  date_range: { start: "2023-06-01", end: "2026-05-08" },
  intercept: 0.001,
  r_squared: 0.42,
  coefficients: [{ factor: "DXY_PROXY", coefficient: -0.22, p_value: null }],
  method: "numpy_lstsq_ols_on_aligned_daily_returns",
  source: { series_source: "demo_fixture:v1" },
  warnings: [],
  run_id: "run-regression",
};

const scenario = {
  available: true,
  env_id: "env-trading",
  base_symbol: "WTI",
  latest_price: 72.11,
  unit: "USD/bbl",
  shocks: {},
  estimated_return_impact_pct: -0.5,
  estimated_price_impact: -0.36,
  directional_pressure: "bearish",
  sensitivity_table: [{ factor: "dxy_shock", label: "DXY move", shock: 1, unit: "pct", impact_per_unit_pct: -0.35, estimated_return_impact_pct: -0.35 }],
  caveats: ["Demo assumptions"],
  source: { series_source: "demo_fixture:v1" },
  warnings: [],
  run_id: "run-scenario",
};

const analogs = {
  available: true,
  env_id: "env-trading",
  target_symbol: "WTI",
  lookback_days: 60,
  n_obs: 1500,
  engine_label: "demo analog engine",
  current_state: {},
  analogs: [{ start_date: "2021-01-04", end_date: "2021-03-31", score: 0.91, cosine_similarity: 0.9, distance: 0.2, matching_features: ["wti_return"], divergent_features: ["vix_change"], forward_30d_return_pct: 4.2 }],
  source: { series_source: "demo_fixture:v1" },
  warnings: [],
  run_id: "run-analogs",
};

const memo = {
  available: true,
  id: "memo-1",
  run_id: "run-regression",
  title: "Trading desk memo",
  question: "Run a regression of WTI returns against DXY, rates, VIX, and inventory.",
  memo_md: "# Trading desk memo\n\n**Question asked:** Run a regression of WTI returns against DXY, rates, VIX, and inventory.",
  evidence: {},
  confidence: "medium",
  created_at: "2026-05-09T12:00:00Z",
  warnings: [],
};

beforeEach(() => {
  vi.mocked(getTradingHealth).mockResolvedValue(health);
  vi.mocked(getTradingSeries).mockResolvedValue({ available: true, env_id: "env-trading", symbols: ["WTI"], rows: [], latest_by_symbol: {}, unavailable_symbols: [], source: { series_source: "demo_fixture:v1" }, warnings: [] });
  vi.mocked(getTradingSeasonality).mockResolvedValue(seasonality);
  vi.mocked(getTradingCorrelation).mockResolvedValue(correlation);
  vi.mocked(runTradingRegression).mockResolvedValue(regression);
  vi.mocked(runTradingScenario).mockResolvedValue(scenario);
  vi.mocked(getTradingAnalogs).mockResolvedValue(analogs);
  vi.mocked(listTradingMemos).mockResolvedValue({ available: true, env_id: "env-trading", memos: [memo], warnings: [] } as TradingMemosResponse);
  vi.mocked(createTradingMemo).mockResolvedValue({ ...memo, id: "memo-2" });
  vi.mocked(askTradingCopilot).mockResolvedValue({
    tool_used: "seasonality",
    available: true,
    result: seasonality,
    warnings: [],
    source: { series_source: "demo_fixture:v1" },
    ai_available: false,
    unsupported_capabilities: [],
  });
});

test("renders useful seeded dashboard output with no AI key", async () => {
  render(<TradingAnalyticsWorkbench envId="env-trading" />);

  expect(await screen.findByText("Energy Trading Command Center")).toBeInTheDocument();
  expect(screen.getByText("Pipeline Health")).toBeInTheDocument();
  expect(screen.getByText("Market Overview")).toBeInTheDocument();
  expect(screen.getByText("Seasonality")).toBeInTheDocument();
  expect(screen.getByText("Rolling Correlation")).toBeInTheDocument();
  expect(screen.getByText("Regression")).toBeInTheDocument();
  expect(screen.getByText("Scenario Model")).toBeInTheDocument();
  expect(screen.getByText("Historical Analogs")).toBeInTheDocument();
  expect(screen.getByText("Decision Memo")).toBeInTheDocument();
  expect(screen.getAllByText("demo_fixture:v1").length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole("button", { name: /ask copilot/i }));
  expect(await screen.findByText("tool: seasonality")).toBeInTheDocument();
  expect(screen.getAllByText("AI unavailable").length).toBeGreaterThan(0);
});

test("generates and renders persisted memo from current analytics payload", async () => {
  render(<TradingAnalyticsWorkbench envId="env-trading" />);

  await screen.findByText("Energy Trading Command Center");
  fireEvent.click(screen.getByRole("button", { name: /generate desk memo/i }));

  await waitFor(() => expect(createTradingMemo).toHaveBeenCalled());
  expect(await screen.findByText(/Question asked/i)).toBeInTheDocument();
});

test("renders readable unavailable states", async () => {
  vi.mocked(getTradingSeasonality).mockResolvedValueOnce({
    ...seasonality,
    available: false,
    unavailable_reason: "Seasonality requires at least 3 prior years.",
    chart: [],
  });

  render(<TradingAnalyticsWorkbench envId="env-trading" />);

  expect(await screen.findByText("Energy Trading Command Center")).toBeInTheDocument();
  expect(screen.getByText("Seasonality requires at least 3 prior years.")).toBeInTheDocument();
});
