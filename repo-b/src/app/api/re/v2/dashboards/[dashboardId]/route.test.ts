import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  DELETE,
  GET,
  PATCH,
} from "@/app/api/re/v2/dashboards/[dashboardId]/route";

const mockGetPool = vi.fn();

vi.mock("@/lib/server/db", () => ({
  getPool: () => mockGetPool(),
}));

const DASHBOARD_ID = "dash-123";
const ENV_ID = "test-env";
const BUSINESS_ID = "a1b2c3d4-0001-0001-0001-000000000001";

function dashboardUrl() {
  return `http://localhost/api/re/v2/dashboards/${DASHBOARD_ID}?env_id=${ENV_ID}&business_id=${BUSINESS_ID}`;
}

describe("/api/re/v2/dashboards/[dashboardId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("GET returns a saved dashboard by id", async () => {
    const query = vi.fn(async () => ({
      rows: [{
        id: DASHBOARD_ID,
        name: "Fund Review",
        layout_archetype: "fund_quarterly_review",
        spec: { widgets: [], density: "compact" },
        density: "compact",
      }],
      rowCount: 1,
    }));

    mockGetPool.mockReturnValue({ query });

    const response = await GET(
      new Request(dashboardUrl(), { method: "GET" }),
      { params: { dashboardId: DASHBOARD_ID } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      id: DASHBOARD_ID,
      name: "Fund Review",
      density: "compact",
    });

    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toContain("FROM re_dashboard");
    expect(params).toEqual([DASHBOARD_ID, ENV_ID, BUSINESS_ID]);
  });

  test("GET returns 404 when the dashboard is missing", async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    mockGetPool.mockReturnValue({ query });

    const response = await GET(
      new Request(dashboardUrl(), { method: "GET" }),
      { params: { dashboardId: DASHBOARD_ID } },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "Dashboard not found" });
  });

  test("PATCH updates an existing dashboard", async () => {
    const query = vi.fn(async () => ({
      rows: [{
        id: DASHBOARD_ID,
        name: "Updated Dashboard",
        layout_archetype: "monthly_operating_report",
        density: "compact",
        spec: { widgets: [{ id: "kpi_1" }], density: "compact" },
      }],
      rowCount: 1,
    }));

    mockGetPool.mockReturnValue({ query });

    const response = await PATCH(
      new Request(dashboardUrl(), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          env_id: ENV_ID,
          business_id: BUSINESS_ID,
          name: "Updated Dashboard",
          description: "Prompt text",
          layout_archetype: "monthly_operating_report",
          spec: { widgets: [{ id: "kpi_1" }] },
          prompt_text: "Prompt text",
          entity_scope: { entity_type: "fund" },
          quarter: "2026Q1",
          density: "compact",
        }),
      }),
      { params: { dashboardId: DASHBOARD_ID } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: DASHBOARD_ID,
      name: "Updated Dashboard",
      density: "compact",
    });

    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toContain("UPDATE re_dashboard");
    expect(params).toEqual([
      DASHBOARD_ID,
      ENV_ID,
      BUSINESS_ID,
      "Updated Dashboard",
      "Prompt text",
      "monthly_operating_report",
      JSON.stringify({ widgets: [{ id: "kpi_1" }], density: "compact" }),
      "Prompt text",
      JSON.stringify({ entity_type: "fund" }),
      "2026Q1",
      null,
      "compact",
    ]);
  });

  test("PATCH returns 400 when required fields are missing", async () => {
    mockGetPool.mockReturnValue({ query: vi.fn() });

    const response = await PATCH(
      new Request(dashboardUrl(), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          env_id: ENV_ID,
          business_id: BUSINESS_ID,
          name: "",
        }),
      }),
      { params: { dashboardId: DASHBOARD_ID } },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "env_id, business_id, name, and spec are required",
    });
  });

  test("DELETE deletes a dashboard and returns 200 on success", async () => {
    const query = vi.fn(async (sql: string) => {
      const text = String(sql);

      if (text.includes("SELECT id FROM re_dashboard WHERE id = $1")) {
        return { rows: [{ id: DASHBOARD_ID }], rowCount: 1 };
      }

      if (text.includes("DELETE FROM re_dashboard WHERE id = $1")) {
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unexpected query: ${text}`);
    });

    mockGetPool.mockReturnValue({ query });

    const response = await DELETE(
      new Request(dashboardUrl(), { method: "DELETE" }),
      { params: { dashboardId: DASHBOARD_ID } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      id: DASHBOARD_ID,
    });
  });

  test("DELETE returns 404 when dashboard not found", async () => {
    const query = vi.fn(async (sql: string) => {
      const text = String(sql);

      if (text.includes("SELECT id FROM re_dashboard WHERE id = $1")) {
        return { rows: [], rowCount: 0 };
      }

      throw new Error(`Unexpected query: ${text}`);
    });

    mockGetPool.mockReturnValue({ query });

    const response = await DELETE(
      new Request(dashboardUrl(), { method: "DELETE" }),
      { params: { dashboardId: DASHBOARD_ID } },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "Dashboard not found or does not belong to this environment",
    });
  });

  test("all handlers return 503 when the database is unavailable", async () => {
    mockGetPool.mockReturnValue(null);

    const getResponse = await GET(
      new Request(dashboardUrl(), { method: "GET" }),
      { params: { dashboardId: DASHBOARD_ID } },
    );
    const patchResponse = await PATCH(
      new Request(dashboardUrl(), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: { dashboardId: DASHBOARD_ID } },
    );
    const deleteResponse = await DELETE(
      new Request(dashboardUrl(), { method: "DELETE" }),
      { params: { dashboardId: DASHBOARD_ID } },
    );

    expect(getResponse.status).toBe(503);
    expect(patchResponse.status).toBe(503);
    expect(deleteResponse.status).toBe(503);
  });
});
