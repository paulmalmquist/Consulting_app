import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import FundTrendPanel from "@/components/repe/portfolio/FundTrendPanel";
import type { FundTrendResponse } from "@/lib/bos-api";

vi.mock("@/lib/bos-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bos-api")>("@/lib/bos-api");
  return {
    ...actual,
    getEnvironmentFundTrend: vi.fn(),
  };
});

vi.mock("@/components/charts/TrendLineChart", () => ({
  __esModule: true,
  default: ({ data, lines }: { data: unknown[]; lines: { key: string; label: string }[] }) => (
    <div
      data-testid="trend-line-chart"
      data-points={String(data.length)}
      data-lines={lines.map((l) => l.label).join("|")}
    />
  ),
}));

import { getEnvironmentFundTrend } from "@/lib/bos-api";

const mocked = getEnvironmentFundTrend as unknown as ReturnType<typeof vi.fn>;

function makeSeries(name: string, fundId: string, values: Array<number | null>): {
  fund_id: string;
  name: string;
  points: Array<{ quarter: string; value: number | null }>;
} {
  // Always 12 quarters: 2024Q1 .. 2026Q4. Values aligned 1:1.
  const quarters = [
    "2024Q1", "2024Q2", "2024Q3", "2024Q4",
    "2025Q1", "2025Q2", "2025Q3", "2025Q4",
    "2026Q1", "2026Q2", "2026Q3", "2026Q4",
  ];
  return {
    fund_id: fundId,
    name,
    points: quarters.map((q, i) => ({ quarter: q, value: values[i] ?? null })),
  };
}

function response(funds: ReturnType<typeof makeSeries>[]): FundTrendResponse {
  return { metric: "ending_nav", quarters: 12, funds };
}

describe("FundTrendPanel", () => {
  beforeEach(() => {
    mocked.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the trend chart when a fund has 8+ released quarters", async () => {
    const eightQ = [null, null, null, null, 100, 110, 120, 125, 130, 140, 150, 160];
    mocked.mockResolvedValueOnce(response([makeSeries("Alpha Fund", "f-a", eightQ)]));

    render(<FundTrendPanel envId="env-1" quarters={12} />);

    const chart = await screen.findByTestId("trend-line-chart");
    expect(chart).toBeInTheDocument();
    expect(chart.getAttribute("data-lines")).toContain("Alpha Fund");
    expect(screen.queryByTestId("fund-trend-insufficient")).toBeNull();
  });

  it("shows the insufficient-data message when only 2 released quarters exist", async () => {
    const twoQ = [null, null, null, null, null, null, null, null, null, null, 150, 160];
    mocked.mockResolvedValueOnce(response([makeSeries("Sparse Fund", "f-s", twoQ)]));

    render(<FundTrendPanel envId="env-1" quarters={12} />);

    await screen.findByTestId("fund-trend-insufficient");
    expect(screen.queryByTestId("trend-line-chart")).toBeNull();
    expect(screen.getByTestId("fund-trend-insufficient").textContent).toContain(
      "Insufficient historical data",
    );
  });

  it("subtitle reports the actual count of released quarters, never the requested window", async () => {
    const twoQ = [null, null, null, null, null, null, null, null, null, null, 150, 160];
    mocked.mockResolvedValueOnce(response([makeSeries("Sparse Fund", "f-s", twoQ)]));

    render(<FundTrendPanel envId="env-1" quarters={12} />);

    await waitFor(() => {
      expect(screen.getByTestId("fund-trend-subtitle").textContent).toContain("2 quarters of released history");
    });
    expect(screen.getByTestId("fund-trend-subtitle").textContent).not.toMatch(/\b12 quarters\b/);
  });

  it("plots only the funds with sufficient data and lists the rest as insufficient", async () => {
    const eightQ = [null, null, null, null, 100, 110, 120, 125, 130, 140, 150, 160];
    const twoQ = [null, null, null, null, null, null, null, null, null, null, 50, 55];
    mocked.mockResolvedValueOnce(
      response([
        makeSeries("Alpha Fund", "f-a", eightQ),
        makeSeries("Beta Fund", "f-b", twoQ),
      ]),
    );

    render(<FundTrendPanel envId="env-1" quarters={12} />);

    const chart = await screen.findByTestId("trend-line-chart");
    expect(chart.getAttribute("data-lines")).toBe("Alpha Fund");
    expect(chart.getAttribute("data-lines")).not.toContain("Beta Fund");
    expect(screen.getByTestId("legend-insufficient-f-b")).toBeInTheDocument();
    expect(screen.getByTestId("legend-insufficient-f-b").textContent).toContain("(2q)");
  });

  it("metric toggle re-fetches via the same endpoint, preserving the time-series source", async () => {
    const eightQ = [null, null, null, null, 100, 110, 120, 125, 130, 140, 150, 160];
    mocked.mockResolvedValue(response([makeSeries("Alpha", "f-a", eightQ)]));

    render(<FundTrendPanel envId="env-1" quarters={12} />);

    await screen.findByTestId("trend-line-chart");
    expect(mocked).toHaveBeenLastCalledWith("env-1", { metric: "ending_nav", quarters: 12 });

    fireEvent.click(screen.getByTestId("metric-toggle-gross_irr"));
    await waitFor(() => {
      expect(mocked).toHaveBeenLastCalledWith("env-1", { metric: "gross_irr", quarters: 12 });
    });

    fireEvent.click(screen.getByTestId("metric-toggle-tvpi"));
    await waitFor(() => {
      expect(mocked).toHaveBeenLastCalledWith("env-1", { metric: "tvpi", quarters: 12 });
    });
  });

  it("never renders the chart when zero funds have data", async () => {
    mocked.mockResolvedValueOnce(response([]));
    render(<FundTrendPanel envId="env-1" quarters={12} />);
    await screen.findByTestId("fund-trend-empty");
    expect(screen.queryByTestId("trend-line-chart")).toBeNull();
  });

  it("does not draw a misleading line at exactly 3 points (below threshold)", async () => {
    const threeQ = [null, null, null, null, null, null, null, null, null, 100, 110, 120];
    mocked.mockResolvedValueOnce(response([makeSeries("Almost", "f-a", threeQ)]));
    render(<FundTrendPanel envId="env-1" quarters={12} />);
    await screen.findByTestId("fund-trend-insufficient");
    expect(screen.queryByTestId("trend-line-chart")).toBeNull();
  });
});
