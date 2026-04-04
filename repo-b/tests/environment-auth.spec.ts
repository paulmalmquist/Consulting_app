import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { signPlatformSession, type PlatformSessionClaims } from "../src/lib/server/sessionAuth";

process.env.BM_SESSION_SECRET = process.env.BM_SESSION_SECRET || "playwright-auth-secret";

function buildClaims(overrides?: Partial<PlatformSessionClaims>): PlatformSessionClaims {
  return {
    v: 1,
    session_id: "session-playwright",
    platform_user_id: "user-playwright",
    supabase_user_id: "supabase-playwright",
    email: "playwright@example.com",
    display_name: "Playwright User",
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
        env_id: "env-floyorker",
        env_slug: "floyorker",
        client_name: "Floyorker",
        role: "member",
        status: "active",
        auth_mode: "private",
        is_default: false,
        business_id: "biz-floyorker",
        tenant_id: "tenant-floyorker",
        industry: "media",
        industry_type: "media",
        workspace_template_key: "content_platform",
      },
      {
        env_id: "env-resume",
        env_slug: "resume",
        client_name: "Paul Malmquist Resume",
        role: "owner",
        status: "active",
        auth_mode: "hybrid",
        is_default: false,
        business_id: "biz-resume",
        tenant_id: "tenant-resume",
        industry: "visual_resume",
        industry_type: "visual_resume",
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

async function installPlatformSession(
  context: BrowserContext,
  baseURL: string,
  claims: PlatformSessionClaims,
) {
  const url = new URL(baseURL);
  const token = await signPlatformSession(claims);

  await context.addCookies([
    {
      name: "bm_session",
      value: token,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "demo_lab_env_id",
      value: claims.active_env_id ?? "",
      domain: url.hostname,
      path: "/",
      sameSite: "Lax",
    },
    {
      name: "bm_env_slug",
      value: claims.active_env_slug ?? "",
      domain: url.hostname,
      path: "/",
      sameSite: "Lax",
    },
  ]);
}

async function mockSessionApis(page: Page, claims: PlatformSessionClaims) {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      json: {
        authenticated: true,
        session: {
          platformAdmin: claims.platform_admin,
          activeEnvironment: {
            env_id: claims.active_env_id,
            env_slug: claims.active_env_slug,
          },
          memberships: claims.memberships.map((membership) => ({
            env_id: membership.env_id,
            env_slug: membership.env_slug,
            client_name: membership.client_name,
            role: membership.role,
            status: membership.status,
            auth_mode: membership.auth_mode,
            business_id: membership.business_id,
            industry: membership.industry,
            industry_type: membership.industry_type,
            workspace_template_key: membership.workspace_template_key,
          })),
        },
      },
    });
  });
}

test("unauthenticated users land on the correct branded login routes", async ({ page }) => {
  await page.goto("/novendor", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/novendor\/login\?returnTo=%2Fnovendor$/);
  await expect(page.getByRole("heading", { name: "Sign in to Novendor" }).first()).toBeVisible();

  await page.goto("/floyorker", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/floyorker\/login\?returnTo=%2Ffloyorker$/);
  await expect(page.getByRole("heading", { name: "Sign in to Floyorker" }).first()).toBeVisible();

  await page.goto("/trading", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/trading\/login\?returnTo=%2Ftrading$/);
  await expect(page.getByRole("heading", { name: "Sign in to Trading Platform" }).first()).toBeVisible();
});

test("authorized sessions land in the environment-specific destination", async ({ context, page, baseURL }) => {
  if (!baseURL) throw new Error("baseURL missing");

  const claims = buildClaims();
  await installPlatformSession(context, baseURL, claims);
  await mockSessionApis(page, claims);

  await page.goto("/novendor", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/lab\/env\/env-novendor\/consulting$/);

  await page.goto("/floyorker", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/lab\/env\/env-floyorker\/content$/);
});

test("authenticated users without trading membership get the trading unauthorized state", async ({
  context,
  page,
  baseURL,
}) => {
  if (!baseURL) throw new Error("baseURL missing");

  const baseClaims = buildClaims();
  const claims = buildClaims({
    memberships: baseClaims.memberships.filter((membership) => membership.env_slug !== "trading"),
  });

  await installPlatformSession(context, baseURL, claims);
  await page.goto("/trading", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(/\/trading\/unauthorized$/);
  await expect(page.getByRole("heading", { name: "Trading access required" })).toBeVisible();
});

test("resume keeps the public view separate from admin access", async ({ context, page, baseURL }) => {
  if (!baseURL) throw new Error("baseURL missing");

  await page.goto("/resume", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Paul Malmquist" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Resume admin login" })).toBeVisible();

  const claims = buildClaims({
    memberships: buildClaims().memberships.map((membership) => (
      membership.env_slug === "resume"
        ? { ...membership, role: "viewer" as const }
        : membership
    )),
    active_env_id: "env-resume",
    active_env_slug: "resume",
    active_role: "viewer",
  });

  await installPlatformSession(context, baseURL, claims);
  await page.goto("/resume/admin", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(/\/resume\/unauthorized$/);
  await expect(page.getByRole("heading", { name: "Owner access required" })).toBeVisible();
});

test("logout clears environment state and returns to the branded login", async ({ context, page, baseURL }) => {
  if (!baseURL) throw new Error("baseURL missing");

  const claims = buildClaims({
    memberships: buildClaims().memberships.filter((membership) => membership.env_slug !== "trading"),
  });
  await installPlatformSession(context, baseURL, claims);

  await page.goto("/trading/unauthorized", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.localStorage.setItem("demo_lab_env_id", "env-trading");
    window.localStorage.setItem("bos_business_id", "biz-trading");
    window.localStorage.setItem("bm_env_business_map", JSON.stringify({ "env-trading": "biz-trading" }));
  });

  await page.route("**/api/auth/logout", async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        redirectTo: "/trading/login",
      },
    });
  });

  await page.waitForTimeout(500);
  const logoutRequest = page.waitForRequest("**/api/auth/logout");
  await page.getByRole("button", { name: "Clear session" }).click();
  await logoutRequest;

  await expect(page).toHaveURL(/\/trading\/login$/);
  const state = await page.evaluate(() => ({
    envId: window.localStorage.getItem("demo_lab_env_id"),
    businessId: window.localStorage.getItem("bos_business_id"),
    businessMap: window.localStorage.getItem("bm_env_business_map"),
  }));
  expect(state).toEqual({
    envId: null,
    businessId: null,
    businessMap: null,
  });
});
