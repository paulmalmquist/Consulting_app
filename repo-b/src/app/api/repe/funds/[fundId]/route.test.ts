import { DELETE } from "@/app/api/repe/funds/[fundId]/route";

const mockGetPool = vi.fn();

vi.mock("@/lib/server/db", () => ({
  getPool: () => mockGetPool(),
}));

describe("DELETE /api/repe/funds/[fundId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("deletes a fund in a transaction and reports descendant cleanup counts", async () => {
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      const text = String(sql);

      if (text === "BEGIN" || text === "COMMIT") {
        return { rows: [], rowCount: null };
      }

      if (text.includes("SELECT fund_id::text, name FROM repe_fund")) {
        return { rows: [{ fund_id: "fund-1", name: "Institutional Growth Fund VII" }], rowCount: 1 };
      }
      if (text.includes("SELECT deal_id::text AS id FROM repe_deal")) {
        return { rows: [{ id: "deal-1" }, { id: "deal-2" }], rowCount: 2 };
      }
      if (text.includes("SELECT asset_id::text AS id FROM repe_asset")) {
        return { rows: [{ id: "asset-1" }, { id: "asset-2" }], rowCount: 2 };
      }
      if (text.includes("SELECT jv_id::text AS id FROM re_jv")) {
        return { rows: [{ id: "jv-1" }], rowCount: 1 };
      }
      if (text.includes("SELECT scenario_id::text AS id FROM re_scenario")) {
        return { rows: [{ id: "scenario-1" }], rowCount: 1 };
      }
      if (text.includes("SELECT to_regclass")) {
        return { rows: [{ exists: true }], rowCount: 1 };
      }
      if (text.includes("FROM information_schema.columns")) {
        return {
          rows: [{ exists: params?.[2] === "primary_fund_id" }],
          rowCount: 1,
        };
      }
      if (text.includes("SELECT model_id::text AS id FROM re_model")) {
        return { rows: [{ id: "model-1" }], rowCount: 1 };
      }
      if (text.includes("DELETE FROM")) {
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unexpected query: ${text}`);
    });

    const release = vi.fn();
    mockGetPool.mockReturnValue({
      connect: vi.fn().mockResolvedValue({
        query,
        release,
      }),
    });

    const response = await DELETE(
      new Request("http://localhost/api/repe/funds/fund-1", { method: "DELETE" }),
      { params: { fundId: "fund-1" } }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      fund_id: "fund-1",
      deleted: {
        investments: 2,
        assets: 2,
        jvs: 1,
        scenarios: 1,
        models: 1,
      },
    });

    const executedSql = query.mock.calls.map(([sql]) => String(sql));
    expect(executedSql.some((sql) => sql.includes("DELETE FROM re_run_provenance"))).toBe(true);
    expect(executedSql.some((sql) => sql.includes("DELETE FROM re_model_scenario_assets"))).toBe(true);
    expect(executedSql.some((sql) => sql.includes("DELETE FROM re_partner"))).toBe(false);
    expect(executedSql.some((sql) => sql.includes("DELETE FROM repe_entity"))).toBe(false);
    expect(query).toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalled();
  });

  test("returns 404 without mutating descendants when the fund does not exist", async () => {
    const query = vi.fn(async (sql: string) => {
      const text = String(sql);
      if (text === "BEGIN" || text === "ROLLBACK") {
        return { rows: [], rowCount: null };
      }
      if (text.includes("SELECT fund_id::text, name FROM repe_fund")) {
        return { rows: [], rowCount: 0 };
      }
      throw new Error(`Unexpected query: ${text}`);
    });

    const release = vi.fn();
    mockGetPool.mockReturnValue({
      connect: vi.fn().mockResolvedValue({
        query,
        release,
      }),
    });

    const response = await DELETE(
      new Request("http://localhost/api/repe/funds/missing-fund", { method: "DELETE" }),
      { params: { fundId: "missing-fund" } }
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error_code: "FUND_NOT_FOUND",
    });
    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalled();
  });
});
