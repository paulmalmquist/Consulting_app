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
        client_name: "Novendor",
        role: "member",
        status: "active",
        auth_mode: "private",
        is_default: true,
        business_id: "biz-novendor",
        tenant_id: "tenant-novendor",
        industry: "consulting",
        industry_type: "consulting",
        workspace_template_key: "consulting_revenue_os",
      },
      {
        env_id: "env-resume",
        env_slug: "resume",
        client_name: "Paul Malmquist Resume",
        role: "viewer",
        status: "active",
        auth_mode: "hybrid",
        is_default: false,
        business_id: "biz-resume",
        tenant_id: "tenant-resume",
        industry: "visual_resume",
        industry_type: "resume",
        workspace_template_key: "visual_resume",
      },
      {
        env_id: "env-trading",
        env_slug: "trading",
        client_name: "Trading Platform",
        role: "member",
        status: "active",
        auth_mode: "private",
        is_default: false,
        business_id: "biz-trading",
        tenant_id: "tenant-trading",
        industry: "trading_platform",
        industry_type: "trading_platform",
        workspace_template_key: "trading_platform",
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
    expect(response.headers.get("location")).toBe("http://localhost:3001/novendor/login?returnTo=%2Fnovendor");
  });

  it("redirects authenticated users without membership to unauthorized", async () => {
    const claims = buildClaims({
      memberships: [buildClaims().memberships[0]],
    });
    const response = await middleware(await makeRequest("/trading", claims));
    expect(response.headers.get("location")).toBe("http://localhost:3001/trading/unauthorized");
  });

  it("allows the public resume route without a session", async () => {
    const response = await middleware(await makeRequest("/resume"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("protects resume admin tools when the membership role is not elevated", async () => {
    const response = await middleware(await makeRequest("/resume/admin", buildClaims()));
    expect(response.headers.get("location")).toBe("http://localhost:3001/resume/unauthorized");
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
