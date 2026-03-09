import { describe, test, expect, beforeEach, vi } from "vitest";
import { DELETE } from "./proposed_route";

const mockGetPool = vi.fn();

vi.mock("@/lib/server/db", () => ({
  getPool: () => mockGetPool(),
}));

describe("DELETE /api/re/v2/dashboards/[dashboardId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("successfully deletes an existing dashboard and returns 204", async () => {
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      const text = String(sql);

      // First query: check if dashboard exists
      if (text.includes("SELECT id FROM re_dashboard WHERE id")) {
        return { rows: [{ id: "test-dashboard-123" }], rowCount: 1 };
      }

      // Second query: delete the dashboard
      if (text.includes("DELETE FROM re_dashboard WHERE id")) {
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unexpected query: ${text}`);
    });

    mockGetPool.mockReturnValue({ query });

    const response = await DELETE(
      new Request("http://localhost/api/re/v2/dashboards/test-dashboard-123", {
        method: "DELETE",
      }),
      { params: { dashboardId: "test-dashboard-123" } }
    );

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");

    // Verify both queries were called
    expect(query).toHaveBeenCalledWith(
      `SELECT id FROM re_dashboard WHERE id = $1::uuid`,
      ["test-dashboard-123"]
    );
    expect(query).toHaveBeenCalledWith(
      `DELETE FROM re_dashboard WHERE id = $1::uuid`,
      ["test-dashboard-123"]
    );
  });

  test("returns 404 when dashboard does not exist", async () => {
    const query = vi.fn(async (sql: string) => {
      const text = String(sql);

      // Dashboard existence check returns no results
      if (text.includes("SELECT id FROM re_dashboard WHERE id")) {
        return { rows: [], rowCount: 0 };
      }

      throw new Error(`Unexpected query: ${text}`);
    });

    mockGetPool.mockReturnValue({ query });

    const response = await DELETE(
      new Request("http://localhost/api/re/v2/dashboards/nonexistent-id", {
        method: "DELETE",
      }),
      { params: { dashboardId: "nonexistent-id" } }
    );

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json).toEqual({ error: "Dashboard not found" });

    // Verify delete was never called
    expect(query).toHaveBeenCalledTimes(1);
    const callText = String(query.mock.calls[0]?.[0]);
    expect(callText).not.toContain("DELETE");
  });

  test("returns 503 when database is unavailable", async () => {
    mockGetPool.mockReturnValue(null);

    const response = await DELETE(
      new Request("http://localhost/api/re/v2/dashboards/test-id", {
        method: "DELETE",
      }),
      { params: { dashboardId: "test-id" } }
    );

    expect(response.status).toBe(503);
    const json = await response.json();
    expect(json).toEqual({ error: "Database unavailable" });
  });

  test("returns 500 on database query error during existence check", async () => {
    const query = vi.fn(async (sql: string) => {
      const text = String(sql);

      if (text.includes("SELECT id FROM re_dashboard WHERE id")) {
        throw new Error("Connection timeout");
      }

      throw new Error(`Unexpected query: ${text}`);
    });

    mockGetPool.mockReturnValue({ query });

    const response = await DELETE(
      new Request("http://localhost/api/re/v2/dashboards/test-id", {
        method: "DELETE",
      }),
      { params: { dashboardId: "test-id" } }
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json).toEqual({ error: "Failed to delete dashboard" });
  });

  test("returns 500 on database query error during delete", async () => {
    const query = vi.fn(async (sql: string) => {
      const text = String(sql);

      // Existence check succeeds
      if (text.includes("SELECT id FROM re_dashboard WHERE id")) {
        return { rows: [{ id: "test-id" }], rowCount: 1 };
      }

      // Delete fails
      if (text.includes("DELETE FROM re_dashboard WHERE id")) {
        throw new Error("Integrity constraint violation");
      }

      throw new Error(`Unexpected query: ${text}`);
    });

    mockGetPool.mockReturnValue({ query });

    const response = await DELETE(
      new Request("http://localhost/api/re/v2/dashboards/test-id", {
        method: "DELETE",
      }),
      { params: { dashboardId: "test-id" } }
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json).toEqual({ error: "Failed to delete dashboard" });
  });

  test("OPTIONS returns correct allowed methods", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/re/v2/dashboards/test-id", {
        method: "OPTIONS",
      }),
      { params: { dashboardId: "test-id" } }
    );

    // This tests the OPTIONS handler exported from the route
    // In actual implementation, OPTIONS would be a separate handler
    expect(response.status).toBe(200);
    expect(response.headers.get("Allow")).toBe("DELETE, OPTIONS");
  });

  test("handles malformed UUID gracefully", async () => {
    const query = vi.fn(async (sql: string) => {
      // PostgreSQL will return no rows for invalid UUID cast
      if (sql.includes("SELECT id FROM re_dashboard WHERE id")) {
        return { rows: [], rowCount: 0 };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    mockGetPool.mockReturnValue({ query });

    const response = await DELETE(
      new Request("http://localhost/api/re/v2/dashboards/not-a-uuid", {
        method: "DELETE",
      }),
      { params: { dashboardId: "not-a-uuid" } }
    );

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json).toEqual({ error: "Dashboard not found" });
  });

  test("cascade delete is triggered (related records cleaned up by database)", async () => {
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      const text = String(sql);

      if (text.includes("SELECT id FROM re_dashboard WHERE id")) {
        return { rows: [{ id: "dashboard-with-subs" }], rowCount: 1 };
      }

      if (text.includes("DELETE FROM re_dashboard WHERE id")) {
        // PostgreSQL triggers CASCADE automatically
        // This would delete:
        // - re_dashboard_favorite records (ON DELETE CASCADE)
        // - re_dashboard_subscription records (ON DELETE CASCADE)
        // - re_dashboard_export records (ON DELETE CASCADE)
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unexpected query: ${text}`);
    });

    mockGetPool.mockReturnValue({ query });

    const response = await DELETE(
      new Request("http://localhost/api/re/v2/dashboards/dashboard-with-subs", {
        method: "DELETE",
      }),
      { params: { dashboardId: "dashboard-with-subs" } }
    );

    expect(response.status).toBe(204);

    // Verify both queries were called (check + delete)
    expect(query).toHaveBeenCalledTimes(2);

    // Cascade delete happens in the database, not in the handler
    // Just verify that the DELETE statement was executed
    const deleteCalls = query.mock.calls.filter((call) =>
      String(call[0]).includes("DELETE FROM re_dashboard")
    );
    expect(deleteCalls).toHaveLength(1);
  });
});
