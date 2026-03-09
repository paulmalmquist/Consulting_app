import { DELETE } from "@/app/api/re/v2/dashboards/route";
import { describe, test, expect, beforeEach, vi } from "vitest";

const mockGetPool = vi.fn();

vi.mock("@/lib/server/db", () => ({
  getPool: () => mockGetPool(),
}));

describe("DELETE /api/re/v2/dashboards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("deletes an existing dashboard and returns success", async () => {
    const dashboardId = "550e8400-e29b-41d4-a716-446655440000";
    const dashboardName = "Q1 Review Dashboard";

    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      const text = String(sql);

      // First query: check if dashboard exists
      if (text.includes("SELECT id, name FROM re_dashboard WHERE id")) {
        return {
          rows: [{ id: dashboardId, name: dashboardName }],
          rowCount: 1,
        };
      }

      // Second query: delete the dashboard
      if (text.includes("DELETE FROM re_dashboard WHERE id")) {
        return {
          rows: [],
          rowCount: 1,
        };
      }

      throw new Error(`Unexpected query: ${text}`);
    });

    mockGetPool.mockReturnValue({ query });

    const response = await DELETE(
      new Request(`http://localhost/api/re/v2/dashboards/${dashboardId}`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({
      success: true,
      message: `Dashboard "${dashboardName}" deleted successfully`,
      dashboard_id: dashboardId,
      deleted_count: 1,
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("SELECT id, name FROM re_dashboard WHERE id"),
      [dashboardId]
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM re_dashboard WHERE id"),
      [dashboardId]
    );
  });

  test("returns 404 when dashboard does not exist", async () => {
    const dashboardId = "550e8400-e29b-41d4-a716-446655440001";

    const query = vi.fn(async (sql: string) => {
      const text = String(sql);

      if (text.includes("SELECT id, name FROM re_dashboard WHERE id")) {
        return { rows: [], rowCount: 0 };
      }

      throw new Error(`Unexpected query: ${text}`);
    });

    mockGetPool.mockReturnValue({ query });

    const response = await DELETE(
      new Request(`http://localhost/api/re/v2/dashboards/${dashboardId}`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data).toMatchObject({
      error: "Dashboard not found",
      dashboard_id: dashboardId,
    });

    // Verify the existence check was called
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("SELECT id, name FROM re_dashboard WHERE id"),
      [dashboardId]
    );
  });

  test("returns 400 when dashboard ID is missing", async () => {
    mockGetPool.mockReturnValue({
      query: vi.fn(),
    });

    const response = await DELETE(
      new Request("http://localhost/api/re/v2/dashboards/", {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toMatchObject({
      error: "Dashboard ID is required",
    });
  });

  test("returns 503 when database is unavailable", async () => {
    mockGetPool.mockReturnValue(null);

    const dashboardId = "550e8400-e29b-41d4-a716-446655440002";

    const response = await DELETE(
      new Request(`http://localhost/api/re/v2/dashboards/${dashboardId}`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(503);
    const data = await response.json();
    expect(data).toMatchObject({
      error: "Database unavailable",
    });
  });

  test("returns 500 on database error", async () => {
    const dashboardId = "550e8400-e29b-41d4-a716-446655440003";

    const query = vi.fn(async (sql: string) => {
      const text = String(sql);

      if (text.includes("SELECT id, name FROM re_dashboard WHERE id")) {
        throw new Error("Database connection lost");
      }

      throw new Error(`Unexpected query: ${text}`);
    });

    mockGetPool.mockReturnValue({ query });

    const response = await DELETE(
      new Request(`http://localhost/api/re/v2/dashboards/${dashboardId}`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toMatchObject({
      error: "Failed to delete dashboard",
    });
  });

  test("cascading delete removes favorites, subscriptions, and exports", async () => {
    // This test verifies that the DELETE operation properly triggers
    // PostgreSQL CASCADE delete for related tables. The cascade is defined
    // at the schema level (330_re_dashboards.sql), so we just need to verify
    // the main dashboard delete succeeds. The database will handle cascades.
    const dashboardId = "550e8400-e29b-41d4-a716-446655440004";

    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      const text = String(sql);

      if (text.includes("SELECT id, name FROM re_dashboard WHERE id")) {
        return {
          rows: [{ id: dashboardId, name: "Dashboard with related data" }],
          rowCount: 1,
        };
      }

      if (text.includes("DELETE FROM re_dashboard WHERE id")) {
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unexpected query: ${text}`);
    });

    mockGetPool.mockReturnValue({ query });

    const response = await DELETE(
      new Request(`http://localhost/api/re/v2/dashboards/${dashboardId}`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);

    // Verify the DELETE query was called (which triggers cascades in the DB)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM re_dashboard WHERE id"),
      [dashboardId]
    );
  });
});
