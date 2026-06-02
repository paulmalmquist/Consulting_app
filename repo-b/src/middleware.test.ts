import { NextRequest } from "next/server";

import { middleware } from "@/middleware";
import { signPlatformSession, type PlatformSessionClaims } from "@/lib/server/sessionAuth";

function buildClaims(overrides?: Partial<PlatformSessionClaims>): PlatformSessionClaims {
  return {
    v: 1,
    session_id: "session-123",
    platform_user_id: "user-123",
    supabase_user_id: "supabase-123",
    email: "user@example.com",
    display_name: "User",
    issued_at: Math.floor(Date.now() / 1000),
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    platform_admin: false,
    active_env_id: "env-novendor",
    active_env_slug: "novendor",
    active_role: "member",
    memberships: [
      {
        env_id: "env-novendor",
        env_slug: "novendor",
        role: "member",
        status: "active",
        is_default: true,
      },
      {
        env_id: "env-trading",
        env_slug: "trading",
        role: "member",
        status: "active",
        is_default: false,
      },
    ],
    ...overrides,
  };
}

async function makeRequest(pathname: string, claims?: PlatformSessionClaims) {
  const headers = new Headers();
  if (claims) {
    headers.set("cookie", `bm_session=${await signPlatformSession(claims)}`);
  }
  return new NextRequest(`http://localhost:3001${pathname}`, { headers });
}

describe("middleware", () => {
  beforeEach(() => {
    process.env.BM_SESSION_SECRET = "test-secret";
    delete process.env.PLAYWRIGHT_BYPASS_AUTH;
  });

  it("redirects unauthenticated users to the correct branded login", async () => {
    const response = await middleware(await makeRequest("/novendor"));
    expect(response.headers.get("location")).toBe("http://localhost:3001/login?returnTo=%2Fnovendor");
  });

  it("redirects authenticated users without membership back to the authenticated selector", async () => {
    const claims = buildClaims({
      memberships: [buildClaims().memberships[0]],
    });
    const response = await middleware(await makeRequest("/trading", claims));
    expect(response.headers.get("location")).toBe("http://localhost:3001/app?denied=trading");
  });

  it("keeps the root route public (marketing home, no middleware)", async () => {
    // / is not in the middleware matcher — Next.js serves (marketing)/page.tsx directly.
    // Middleware does not run for this path, so we skip this test at the middleware layer.
    // The route is verified in the Playwright smoke test.
  });

  it("redirects authenticated users away from /login to /app", async () => {
    const loginResponse = await middleware(await makeRequest("/login", buildClaims()));
    expect(loginResponse.headers.get("location")).toBe("http://localhost:3001/app");
  });

  it("rotates the active environment cookie when navigating into another authorized env", async () => {
    const response = await middleware(
      await makeRequest(
        "/lab/env/env-trading/markets",
        buildClaims(),
      ),
    );
    const setCookie = response.headers.get("set-cookie") || "";
    expect(setCookie).toContain("demo_lab_env_id=env-trading");
    expect(setCookie).toContain("bm_env_slug=trading");
  });
});

describe("middleware — telemetry reviewer scope", () => {
  const TENV = "dc82d39d-9be2-49b0-a01d-c7181b13a8b6";

  function reviewerClaims(): PlatformSessionClaims {
    return buildClaims({
      platform_admin: false,
      active_env_id: TENV,
      active_env_slug: "novendor",
      active_role: "telemetry_reviewer",
      memberships: [
        { env_id: TENV, env_slug: "novendor", role: "telemetry_reviewer", status: "active", is_default: true },
      ],
    });
  }

  beforeEach(() => {
    process.env.BM_SESSION_SECRET = "test-secret";
    delete process.env.PLAYWRIGHT_BYPASS_AUTH;
  });

  it("allows the reviewer into its env's /telemetry routes (no redirect)", async () => {
    for (const p of [`/lab/env/${TENV}/telemetry`, `/lab/env/${TENV}/telemetry/replay`, `/lab/env/${TENV}/telemetry/governance`]) {
      const res = await middleware(await makeRequest(p, reviewerClaims()));
      expect(res.headers.get("location")).toBeNull();
    }
  });

  it("redirects the reviewer away from non-telemetry departments in the same env", async () => {
    const res = await middleware(await makeRequest(`/lab/env/${TENV}/consulting`, reviewerClaims()));
    expect(res.headers.get("location")).toBe(`http://localhost:3001/lab/env/${TENV}/telemetry`);
  });

  it("redirects the reviewer away from another environment", async () => {
    const res = await middleware(await makeRequest("/lab/env/env-trading/telemetry", reviewerClaims()));
    expect(res.headers.get("location")).toBe(`http://localhost:3001/lab/env/${TENV}/telemetry`);
  });

  it("redirects the reviewer away from /app, /lab/system, and top-level slug surfaces", async () => {
    for (const p of ["/app", "/lab/system/control-tower", "/novendor"]) {
      const res = await middleware(await makeRequest(p, reviewerClaims()));
      expect(res.headers.get("location")).toBe(`http://localhost:3001/lab/env/${TENV}/telemetry`);
    }
  });

  it("returns 403 (not a redirect) when the reviewer hits a non-telemetry API", async () => {
    const res = await middleware(await makeRequest("/api/commands/run", reviewerClaims()));
    expect(res.status).toBe(403);
  });

  it("does NOT affect a normal admin/member session", async () => {
    // member with trading membership still rotates into trading (unchanged behavior)
    const res = await middleware(await makeRequest("/lab/env/env-trading/markets", buildClaims()));
    expect((res.headers.get("set-cookie") || "")).toContain("demo_lab_env_id=env-trading");
  });
});
