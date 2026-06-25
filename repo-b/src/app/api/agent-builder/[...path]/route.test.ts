import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/sessionAuth", () => ({
  parseSessionFromRequest: vi.fn(async (request: Request) =>
    request.headers.get("cookie") ? { platform_user_id: "user-1" } : null,
  ),
}));

vi.mock("@/lib/server/platformForwardHeaders", () => ({
  buildPlatformSessionHeaders: vi.fn(async () => ({
    "x-bm-actor": "user:test:user-1",
    "x-bm-auth-provider": "platform-session",
    "x-bm-user-id": "user-1",
    "x-bm-env-id": "env-1",
    "x-bm-business-id": "00000000-0000-0000-0000-000000000001",
  })),
}));

import { GET, PATCH, POST } from "./route";

describe("agent builder proxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fails closed without a platform session", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/api/agent-builder/palette"),
      { params: { path: ["palette"] } },
    );
    expect(response.status).toBe(401);
  });

  it.each([
    ["GET", GET, undefined],
    ["POST", POST, JSON.stringify({ graph: {} })],
    ["PATCH", PATCH, JSON.stringify({ base_version_number: 1 })],
  ] as const)("forwards %s with platform scope headers", async (method, handler, body) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const request = new NextRequest(
      "http://localhost:3000/api/agent-builder/workflows/abc/draft?limit=1",
      {
        method,
        headers: { cookie: "bm_session=test", "content-type": "application/json" },
        body,
      },
    );
    const response = await handler(request, {
      params: { path: ["workflows", "abc", "draft"] },
    });
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/agent-builder/workflows/abc/draft?limit=1"),
      expect.objectContaining({
        method,
        headers: expect.objectContaining({
          "x-bm-auth-provider": "platform-session",
          "x-bm-business-id": "00000000-0000-0000-0000-000000000001",
        }),
      }),
    );
  });
});
