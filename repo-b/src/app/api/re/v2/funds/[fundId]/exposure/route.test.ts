import { GET } from "@/app/api/re/v2/funds/[fundId]/exposure/route";

const mockGetPool = vi.fn();
const mockComputeFundExposureInsights = vi.fn();

vi.mock("@/lib/server/db", () => ({
  getPool: () => mockGetPool(),
}));

vi.mock("@/lib/server/reFundExposure", () => ({
  computeFundExposureInsights: (...args: unknown[]) => mockComputeFundExposureInsights(...args),
}));

describe("GET /api/re/v2/funds/[fundId]/exposure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 503 when the database is unavailable", async () => {
    mockGetPool.mockReturnValue(null);

    const response = await GET(
      new Request("http://localhost/api/re/v2/funds/fund-1/exposure?quarter=2026Q1"),
      { params: { fundId: "fund-1" } }
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error_code: "DB_UNAVAILABLE" });
  });

  it("returns 400 when quarter is missing", async () => {
    mockGetPool.mockReturnValue({});

    const response = await GET(
      new Request("http://localhost/api/re/v2/funds/fund-1/exposure"),
      { params: { fundId: "fund-1" } }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error_code: "MISSING_PARAM" });
  });

  it("returns the aggregated exposure payload", async () => {
    mockGetPool.mockReturnValue({ query: vi.fn() });
    mockComputeFundExposureInsights.mockResolvedValue({
      fund_id: "fund-1",
      quarter: "2026Q1",
      scenario_id: null,
      sector_allocation: [{ label: "industrial", value: 120, pct: 60, source_count: 2 }],
      geographic_allocation: [{ label: "Dallas", value: 120, pct: 60, source_count: 2 }],
      total_weight: 200,
      sector_summary: { total_weight: 200, classified_weight: 160, unclassified_weight: 40, coverage_pct: 80 },
      geographic_summary: { total_weight: 200, classified_weight: 180, unclassified_weight: 20, coverage_pct: 90 },
      weighting_basis_used: "mixed",
    });

    const response = await GET(
      new Request("http://localhost/api/re/v2/funds/fund-1/exposure?quarter=2026Q1"),
      { params: { fundId: "fund-1" } }
    );

    expect(response.status).toBe(200);
    expect(mockComputeFundExposureInsights).toHaveBeenCalledWith({
      pool: expect.any(Object),
      fundId: "fund-1",
      quarter: "2026Q1",
      scenarioId: null,
    });
    expect(await response.json()).toMatchObject({
      sector_summary: { coverage_pct: 80 },
      geographic_summary: { coverage_pct: 90 },
      weighting_basis_used: "mixed",
    });
  });
});
