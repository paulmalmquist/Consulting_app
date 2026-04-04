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
  envMap: Record<string, string> = {},
  bizMap: Record<string, string> = {},
): PlatformSessionClaims {
  // Use real env_ids/business_ids from backend discovery when available
  const eid = (slug: string) => envMap[slug] ?? `env-${slug}`;
  const bid = (slug: string) => bizMap[slug] ?? null;

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
        env_id: eid("novendor"),
        env_slug: "novendor" as EnvironmentSlug,
        client_name: "Novendor",
        role: "owner",
        status: "active",
        auth_mode: "private",
        is_default: activeEnvSlug === "novendor",
        business_id: bid("novendor"),
        tenant_id: null,
        industry: "consulting",
        industry_type: "consulting",
        workspace_template_key: "consulting_revenue_os",
      },
      {
        env_id: eid("resume"),
        env_slug: "resume" as EnvironmentSlug,
        client_name: "Paul Malmquist Resume",
        role: "owner",
        status: "active",
        auth_mode: "hybrid",
        is_default: activeEnvSlug === "resume",
        business_id: bid("resume"),
        tenant_id: null,
        industry: "visual_resume",
        industry_type: "visual_resume",
        workspace_template_key: "visual_resume",
      },
      {
        env_id: eid("meridian"),
        env_slug: "meridian" as EnvironmentSlug,
        client_name: "Meridian Capital Management",
        role: "owner",
        status: "active",
        auth_mode: "private",
        is_default: activeEnvSlug === "meridian",
        business_id: bid("meridian"),
        tenant_id: null,
        industry: "repe",
        industry_type: "repe",
        workspace_template_key: "repe",
      },
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

// ── Winston companion helpers ────────────────────────────────────────

/**
 * Click the companion toggle and wait for the dialog to appear.
 */
export async function openWinstonCompanion(page: Page): Promise<void> {
  // Wait for the toggle to be visible (page may still be hydrating)
  const toggle = page.getByTestId("global-commandbar-toggle");
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  console.log("[eval] toggle visible, clicking...");

  // Click to open if the companion dialog isn't already showing
  const dialog = page.locator('[role="dialog"][aria-label="Winston companion"]');
  const isAlreadyOpen = await dialog.isVisible().catch(() => false);
  if (!isAlreadyOpen) {
    await toggle.click();
    console.log("[eval] toggle clicked");
  }

  // Wait for the dialog AND the input to be ready
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  console.log("[eval] dialog visible");
  await expect(page.getByTestId("global-commandbar-input")).toBeVisible({
    timeout: 5_000,
  });
  console.log("[eval] input visible, companion ready");
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

  // Type the message character by character — this reliably triggers React onChange
  // on controlled inputs (fill() can miss the onChange dispatch in some React setups).
  console.log("[eval] typing message:", userText.slice(0, 40));
  await input.focus();
  await input.pressSequentially(userText, { delay: 10 });
  console.log("[eval] typed, waiting for React state update...");

  // Wait for React to process the onChange events
  await page.waitForTimeout(500);

  // Verify the Send button is now enabled (draft should be non-empty)
  const sendBtn = page.getByRole("button", { name: "Send" });
  const sendEnabled = await sendBtn.isEnabled().catch(() => false);
  console.log(`[eval] Send button enabled=${sendEnabled}`);

  if (sendEnabled) {
    await sendBtn.click({ force: true });
    console.log("[eval] Send button clicked");
  } else {
    // Fall back to Enter key
    console.log("[eval] Send disabled, pressing Enter...");
    await input.press("Enter");
    console.log("[eval] Enter pressed");
  }
  console.log("[eval] message sent, polling for response...");

  // Wait for response: poll the output area until we see text that wasn't there before.
  // The output container holds ALL messages; after sending, the assistant response
  // streams in. We use a text-stability check instead of toBeEmpty to handle
  // output areas that have structural markup even when empty.
  let responseText = "";
  let stableCount = 0;
  const pollStart = Date.now();

  let pollCount = 0;
  while (Date.now() - pollStart < timeoutMs) {
    const currentText = (await output.textContent()) ?? "";
    pollCount++;
    // Log first 5 polls and then every 10th
    if (pollCount <= 5 || pollCount % 10 === 0) {
      console.log(`[eval] poll #${pollCount}: text length=${currentText.length}, text=${JSON.stringify(currentText.slice(0, 100))}`);
    }

    // Look for text that appeared AFTER our sent message
    // The output includes user messages + assistant messages
    if (currentText.length > 0 && currentText !== responseText) {
      responseText = currentText;
      stableCount = 0;
    } else if (currentText.length > 0) {
      stableCount++;
    }

    // Text has been stable for ~2s (4 × 500ms) → stream is done
    if (stableCount >= 4 && responseText.length > 0) {
      console.log(`[eval] response stabilized after ${pollCount} polls, length=${responseText.length}`);
      break;
    }
    await page.waitForTimeout(500);
  }

  // Brief stabilization for final React state flush
  await page.waitForTimeout(300);

  // Re-read final text
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
