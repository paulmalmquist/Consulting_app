import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPool } from "@/lib/server/db";
import { POST } from "./route";

vi.mock("@/lib/server/db", () => ({
  getPool: vi.fn(),
}));

const mockedGetPool = vi.mocked(getPool);

function postRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/public/ai-roi-lead", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "vitest",
      "x-forwarded-for": "127.0.0.1",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/public/ai-roi-lead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a lead for a valid payload", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "lead-1" }] });
    mockedGetPool.mockReturnValue({ query } as never);

    const response = await POST(
      postRequest({
        email: "Buyer@Example.com",
        company_name: "Example Co",
        source: "ai_roi_calculator",
        payload_json: { selectedCombinedMultiplier: 8.57 },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({ status: "created", id: "lead-1" });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[1]?.[0]).toBe("buyer@example.com");
  });

  it("rejects an invalid email", async () => {
    const response = await POST(postRequest({ email: "bad", source: "ai_roi_calculator" }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.status).toBe("error");
    expect(mockedGetPool).not.toHaveBeenCalled();
  });

  it("returns 503 when the database pool is unavailable", async () => {
    mockedGetPool.mockReturnValue(null);

    const response = await POST(postRequest({ email: "buyer@example.com", source: "ai_roi_calculator" }));
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.reason).toBe("Database pool is not configured.");
  });

  it("returns 500 when insertion fails", async () => {
    const query = vi.fn().mockRejectedValue(new Error("insert failed"));
    mockedGetPool.mockReturnValue({ query } as never);

    const response = await POST(postRequest({ email: "buyer@example.com", source: "ai_roi_calculator" }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.reason).toBe("insert failed");
  });
});
