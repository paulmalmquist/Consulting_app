/**
 * Shared helpers for AI eval tests.
 *
 * Provides session installation, Winston companion interaction,
 * and streaming response capture utilities.
 */
import { expect, type BrowserContext, type Page } from "@playwright/test";
import { signPlatformSession, type PlatformSessionClaims } from "../../src/lib/server/sessionAuth";
import type { EnvironmentSlug } from "../../src/lib/environmentAuth";

// Must match the secret used in playwright.ai-eval.config.ts webServer command
process.env.BM_SESSION_SECRET =
  process.env.BM_SESSION_SECRET || "playwright-auth-secret";

// ── Session helpers ──────────────────────────────────────────────────

/**
 * Build a PlatformSessionClaims for the given active environment.
 * Includes novendor (default) and resume in memberships always.
 * Pass env_slug="meridian" to include a meridian membership using activeEnvId.
 */
export function buildEvalClaims(
  activeEnvId: string,
  activeEnvSlug: EnvironmentSlug,
): PlatformSessionClaims {
  const meridianMembership =
    activeEnvSlug === "meridian"
      ? [
          {
            env_id: activeEnvId,
            env_slug: "meridian" as EnvironmentSlug,
            client_name: "Meridian Capital Management",
            role: "owner" as const,
            status: "active" as const,
            auth_mode: "private" as const,
            is_default: false,
            business_id: null,
            tenant_id: null,
            industry: "repe",
            industry_type: "repe",
            workspace_template_key: "repe",
          },
        ]
      : [];

  return {
    v: 1,
    session_id: "session-ai-eval",
    platform_user_id: "user-ai-eval",
    supabase_user_id: "supabase-ai-eval",
    email: "eval@example.com",
    display_name: "AI Eval User",
    issued_at: Math.floor(Date.now() / 1000),
    expires_at: Math.floor(Date.now() / 1000) + 7200,
    platform_admin: true,
    active_env_id: activeEnvId,
    active_env_slug: activeEnvSlug,
    active_role: "owner",
    memberships: [
      {
        env_id: "env-novendor",
        env_slug: "novendor" as EnvironmentSlug,
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
        env_id: "env-resume",
        env_slug: "resume" as EnvironmentSlug,
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
      ...meridianMembership,
    ],
  };
}

/**
 * Install a signed bm_session cookie plus env cookies on the browser context.
 * Must be called before page.goto().
 */
export async function installEvalSession(
  context: BrowserContext,
  baseURL: string,
  claims: PlatformSessionClaims,
): Promise<void> {
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
      value: claims.active_env_id,
      domain: url.hostname,
      path: "/",
      sameSite: "Lax",
    },
    {
      name: "bm_env_slug",
      value: claims.active_env_slug,
      domain: url.hostname,
      path: "/",
      sameSite: "Lax",
    },
  ]);
}

// ── Winston companion helpers ────────────────────────────────────────

/**
 * Click the companion toggle and wait for the dialog to appear.
 */
export async function openWinstonCompanion(page: Page): Promise<void> {
  const toggle = page.getByTestId("global-commandbar-toggle");
  // Toggle may already be open; only click if dialog not visible
  const dialog = page.getByRole("dialog", { name: /Winston/i });
  if (!(await dialog.isVisible())) {
    await toggle.click();
  }
  // Wait for the input to be ready
  await expect(page.getByTestId("global-commandbar-input")).toBeVisible({
    timeout: 10_000,
  });
}

/**
 * Send a message to Winston and wait for the full response to stream in.
 *
 * Strategy:
 *   1. Fill input and submit
 *   2. Wait for output to become non-empty (first token arrives)
 *   3. Wait for Send button to re-enable (WinstonCompanionProvider sets thinking=false on SSE "done")
 *   4. Brief stabilization wait for React state flush
 *   5. Return the final output text
 */
export async function sendAndWaitForResponse(
  page: Page,
  userText: string,
  timeoutMs = 60_000,
): Promise<string> {
  const input = page.getByTestId("global-commandbar-input");
  const output = page.getByTestId("global-commandbar-output");
  // Send button is inside the companion panel, disabled while thinking=true
  const sendBtn = page
    .locator('[data-testid="global-commandbar-input"]')
    .locator("..") // parent form/container
    .getByRole("button", { name: /send/i });

  await input.fill(userText);

  // Use keyboard submit as fallback if button selector is fragile
  await input.press("Enter");

  // Wait for at least one token to appear in the output
  await expect(output).not.toBeEmpty({ timeout: 15_000 });

  // Wait for stream to complete: Send button re-enables when thinking=false
  // (fired by onDone callback in WinstonCompanionProvider)
  try {
    await expect(sendBtn).toBeEnabled({ timeout: timeoutMs });
  } catch {
    // If Send button selector fails, fall back to a fixed wait
    // This can happen if the companion layout changes
    await page.waitForTimeout(5_000);
  }

  // Brief stabilization for React state flush after SSE done
  await page.waitForTimeout(400);

  return (await output.textContent()) ?? "";
}

/**
 * Get all visible assistant message text from the companion output.
 * Returns the last assistant message (most recent response).
 */
export async function getLastAssistantMessage(page: Page): Promise<string> {
  const output = page.getByTestId("global-commandbar-output");
  return (await output.textContent()) ?? "";
}
