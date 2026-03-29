import {
  findMembershipBySlug,
  getActiveMembership,
  getLoginRedirectForSession,
  parsePlatformSessionFromCookieValue,
  sessionHasEnvironmentAccess,
  signPlatformSession,
  type PlatformSessionClaims,
} from "@/lib/server/sessionAuth";

function buildClaims(): PlatformSessionClaims {
  return {
    v: 1,
    session_id: "session-123",
    platform_user_id: "user-123",
    supabase_user_id: "supabase-123",
    email: "owner@example.com",
    display_name: "Owner",
    issued_at: Math.floor(Date.now() / 1000),
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    platform_admin: true,
    active_env_id: "env-novendor",
    active_env_slug: "novendor",
    active_role: "owner",
    memberships: [
      {
        env_id: "env-novendor",
        env_slug: "novendor",
        client_name: "Novendor",
        role: "owner",
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
  };
}

describe("sessionAuth", () => {
  beforeEach(() => {
    process.env.BM_SESSION_SECRET = "test-secret";
  });

  it("signs and verifies environment-scoped sessions", async () => {
    const token = await signPlatformSession(buildClaims());
    const session = await parsePlatformSessionFromCookieValue(token);

    expect(session?.platform_user_id).toBe("user-123");
    expect(session?.active_env_slug).toBe("novendor");
    expect(session?.role).toBe("admin");
    expect(getActiveMembership(session)?.env_id).toBe("env-novendor");
  });

  it("checks membership access explicitly by slug", async () => {
    const session = await parsePlatformSessionFromCookieValue(
      await signPlatformSession(buildClaims()),
    );

    expect(sessionHasEnvironmentAccess(session, { slug: "novendor" })).toBe(true);
    expect(sessionHasEnvironmentAccess(session, { slug: "floyorker" })).toBe(false);
    expect(findMembershipBySlug(session, "trading")?.tenant_id).toBe("tenant-trading");
  });

  it("uses the canonical root login route for signed-out sessions", async () => {
    const session = await parsePlatformSessionFromCookieValue(
      await signPlatformSession(buildClaims()),
    );

    expect(getLoginRedirectForSession(session)).toBe("/");
  });
});
