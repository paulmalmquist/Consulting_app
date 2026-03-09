import { describe, test, expect, beforeEach, vi } from "vitest";
import { DELETE } from "@/app/api/re/v2/dashboards/[dashboardId]/route";

const mockGetPool = vi.fn();

vi.mock("@/lib/server/db", () => ({
  getPool: () => mockGetPool(),
}));

describe("DELETE /api/re/v2/dashboards/[dashboardId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("deletes a dashboard and returns 200 on success", async () => {
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      const text = String(sql);

      // Verify ownership query
      if (text.includes("SELECT id FROM re_dashboard WHERE id = $1")) {
        return { rows: [{ id: "dash-123" }], rowCount: 1 };
      }

      // Delete query
      if (text.includes("DELETE FROM re_dashboard WHERE id = $1")) {
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unexpected query: ${text}`);
    });

    mockGetPool.mockReturnValue({ query });

    const response = await DELETE(
      new Request(
        "http://localhost/api/re/v2/dashboards/dash-123?env_id=test-env&business_id=a1b2c3d4-0001-0001-0001-000000000001",
        { method: "DELETE" }
      ),
      { params: { dashboardId: "dash-123" } }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      id: "dash-123",
    });

    // Verify both verify and delete queries were called
    expect(query).toHaveBeenCalledWith(
      "SELECT id FROM re_dashboard WHERE id = $1 AND env_id = $2 AND business_id = $3::uuid",
      ["dash-123", "test-env", "a1b2c3d4-0001-0001-0001-000000000001"]
    );
    expect(query).toHaveBeenCalledWith("DELETE FROM re_dashboard WHERE id = $1", ["dash-123"]);
  });

  test("returns 404 when dashboard not found", async () => {
    const query = vi.fn(async (sql: string) => {
      const text = String(sql);

      // Verify ownership query returns no results
      if (text.includes("SELECT id FROM re_dashboard WHERE id = $1")) {
        return { rows: [], rowCount: 0 };
      }

      throw new Error(`Unexpected query: ${text}`);
    });

    mockGetPool.mockReturnValue({ query });

    const response = await DELETE(
      new Request(
        "http://localhost/api/re/v2/dashboards/missing-dash?env_id=test-env&business_id=a1b2c3d4-0001-0001-0001-000000000001",
        { method: "DELETE" }
      ),
      { params: { dashboardId: "missing-dash" } }
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toContain("Dashboard not found");
  });

  test("returns 400 when dashboardId is missing", async () => {
    mockGetPool.mockReturnValue({ query: vi.fn() });

    const response = await DELETE(
      new Request(
        "http://localhost/api/re/v2/dashboards/?env_id=test-env&business_id=a1b2c3d4-0001-0001-0001-000000000001",
        { method: "DELETE" }
      ),
      { params: { dashboardId: "" } }
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("required");
  });

  test("returns 400 when env_id is missing", async () => {
    mockGetPool.mockReturnValue({ query: vi.fn() });

    const response = await DELETE(
      new Request("http://localhost/api/re/v2/dashboards/dash-123?business_id=a1b2c3d4-0001-0001-0001-000000000001", {
        method: "DELETE",
      }),
      { params: { dashboardId: "dash-123" } }
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("required");
  });

  test("returns 400 when business_id is missing", async () => {
    mockGetPool.mockReturnValue({ query: vi.fn() });

    const response = await DELETE(
      new Request("http://localhost/api/re/v2/dashboards/dash-123?env_id=test-env", {
        method: "DELETE",
      }),
      { params: { dashboardId: "dash-123" } }
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("required");
  });

  test("returns 503 when database is unavailable", async () => {
    mockGetPool.mockReturnValue(null);

    const response = await DELETE(
      new Request(
        "http://localhost/api/re/v2/dashboards/dash-123?env_id=test-env&business_id=a1b2c3d4-0001-0001-0001-000000000001",
        { method: "DELETE" }
      ),
      { params: { dashboardId: "dash-123" } }
    );

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toContain("Database unavailable");
  });

  test("returns 500 on query error", async () => {
    const query = vi.fn(async () => {
      throw new Error("Database connection failed");
    });

    mockGetPool.mockReturnValue({ query });

    const response = await DELETE(
      new Request(
        "http://localhost/api/re/v2/dashboards/dash-123?env_id=test-env&business_id=a1b2c3d4-0001-0001-0001-000000000001",
        { method: "DELETE" }
      ),
      { params: { dashboardId: "dash-123" } }
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toContain("Failed to delete dashboard");
  });
});
