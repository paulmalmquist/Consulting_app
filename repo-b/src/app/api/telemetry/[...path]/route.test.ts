import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";
import {
  signPlatformSession,
  type PlatformSessionClaims,
} from "@/lib/server/sessionAuth";

const ENV_ID = "env-telemetry";

function claims(envId = ENV_ID): PlatformSessionClaims {
  return {
    v: 1,
    session_id: "session-1",
    platform_user_id: "user-1",
    supabase_user_id: null,
    email: "reviewer@example.com",
    display_name: "Reviewer",
    issued_at: Math.floor(Date.now() / 1000),
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    platform_admin: false,
    active_env_id: envId,
    active_env_slug: "novendor",
    active_role: "telemetry_reviewer",
    memberships: [
      {
        env_id: envId,
        env_slug: "novendor",
        role: "telemetry_reviewer",
        status: "active",
        is_default: true,
      },
    ],
  };
}

async function request(
  path: string,
  session?: PlatformSessionClaims,
  routeEnvId = ENV_ID,
) {
  const headers = new Headers({ host: "localhost:3001" });
  headers.set("x-telemetry-route-env-id", routeEnvId);
  if (session) {
    headers.set("cookie", `bm_session=${await signPlatformSession(session)}`);
  }
  return new NextRequest(`http://localhost:3001${path}`, { headers });
}

describe("telemetry proxy metadata access", () => {
  beforeEach(() => {
    process.env.BM_SESSION_SECRET = "test-secret";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ nodes: [], edges: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.BM_SESSION_SECRET;
  });

  it("requires authentication for the metadata graph", async () => {
    const response = await GET(
      await request("/api/telemetry/metadata/graph?env_id=telemetry-demo&business_id=biz"),
      { params: { path: ["metadata", "graph"] } },
    );
    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects metadata access for another environment", async () => {
    const response = await GET(
      await request(
        "/api/telemetry/metadata/graph?env_id=telemetry-demo&business_id=biz",
        claims(),
        "other-env",
      ),
      { params: { path: ["metadata", "graph"] } },
    );
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("forwards an authorized metadata request with its scoped query", async () => {
    const response = await GET(
      await request(
        "/api/telemetry/metadata/graph?env_id=telemetry-demo&business_id=biz",
        claims(),
      ),
      { params: { path: ["metadata", "graph"] } },
    );
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/telemetry/metadata/graph?env_id=telemetry-demo&business_id=biz"),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("leaves existing non-metadata telemetry proxy behavior unchanged", async () => {
    const response = await GET(
      await request("/api/telemetry/replay"),
      { params: { path: ["replay"] } },
    );
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalled();
  });
});
