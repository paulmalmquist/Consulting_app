import { expect, test, type Page } from "@playwright/test";
import { makeResumeWorkspacePayload, RESUME_BUSINESS_ID, RESUME_ENV_ID } from "../src/test/fixtures/resumeWorkspace";

test.describe.configure({ mode: "serial" });

async function installResumeMocks(page: Page, workspacePayload: Record<string, unknown>) {
  await page.route("**/v1/environments**", async (route) => {
    const url = new URL(route.request().url());
    const envRecord = {
      env_id: RESUME_ENV_ID,
      client_name: "Paul Malmquist Resume",
      industry: "visual_resume",
      industry_type: "visual_resume",
      schema_name: "env_resume",
      business_id: RESUME_BUSINESS_ID,
      is_active: true,
    };

    if (url.pathname.endsWith(`/v1/environments/${RESUME_ENV_ID}`)) {
      await route.fulfill({ json: envRecord });
      return;
    }

    await route.fulfill({
      json: {
        environments: [envRecord],
      },
    });
  });

  await page.route("**/api/resume/v1/context**", async (route) => {
    await route.fulfill({
      json: {
        env_id: RESUME_ENV_ID,
        business_id: RESUME_BUSINESS_ID,
        created: false,
        source: "fixture",
        diagnostics: {},
      },
    });
  });

  await page.route("**/api/resume/v1/workspace**", async (route) => {
    await route.fulfill({ json: workspacePayload });
  });

  await page.route("**/api/mcp/context-snapshot**", async (route) => {
    await route.fulfill({
      json: {
        route: `/lab/env/${RESUME_ENV_ID}/resume`,
        environments: [],
        selectedEnv: {
          env_id: RESUME_ENV_ID,
          client_name: "Paul Malmquist Resume",
          schema_name: "env_resume",
          business_id: RESUME_BUSINESS_ID,
          industry: "visual_resume",
        },
        business: {
          business_id: RESUME_BUSINESS_ID,
          name: "Paul Malmquist Resume",
        },
        modulesAvailable: ["resume"],
        recentRuns: [],
      },
    });
  });

  await page.route("**/api/ai/gateway/conversations**", async (route) => {
    await route.fulfill({
      json: {
        conversations: [],
      },
    });
  });
}

async function assertNoResumeErrors(pageErrors: string[], consoleErrors: string[]) {
  expect(pageErrors).toEqual([]);
  const blockingConsoleErrors = consoleErrors.filter(
    (line) => !/favicon|net::ERR_ABORTED|Failed to fetch RSC payload/i.test(line),
  );
  expect(blockingConsoleErrors).toEqual([]);
  expect([...pageErrors, ...consoleErrors].some((line) => /Maximum update depth|getSnapshot should be cached|hydration/i.test(line))).toBe(false);
}

test.beforeEach(async ({ context, page, baseURL }) => {
  if (!baseURL) throw new Error("baseURL missing");
  const url = new URL(baseURL);

  await context.addCookies([
    {
      name: "demo_lab_session",
      value: "active",
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
});

test("visual resume renders end-to-end in dark mode without runtime errors", async ({ page }) => {
  test.setTimeout(60_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  await page.addInitScript(() => {
    window.localStorage.setItem("bm_theme_mode", "dark");
  });

  await installResumeMocks(page, makeResumeWorkspacePayload());

  await page.goto(`/lab/env/${RESUME_ENV_ID}/resume`, { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Systems Builder and Product Operator" })).toBeVisible();
  await expect(page.getByText("Execution timeline as system backbone")).toBeVisible();
  await expect(page.getByText("Context-aware explanation layer")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Application error");

  await assertNoResumeErrors(pageErrors, consoleErrors);
});

test("visual resume degrades gracefully in light mode with sparse payloads", async ({ page }) => {
  test.setTimeout(60_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  await page.addInitScript(() => {
    window.localStorage.setItem("bm_theme_mode", "light");
  });

  await installResumeMocks(page, {
    identity: {
      name: "Paul Malmquist",
    },
    timeline: {
      roles: [],
      milestones: [],
    },
    architecture: {
      nodes: [],
      edges: [],
    },
    modeling: {},
    bi: {
      entities: [],
    },
    stories: [],
  });

  await page.goto(`/lab/env/${RESUME_ENV_ID}/resume`, { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Systems Builder and Product Operator" })).toBeVisible();
  await expect(page.getByText("Timeline temporarily unavailable")).toBeVisible();
  await page.getByRole("button", { name: "Architecture", exact: true }).click();
  await expect(page.getByText("Visualization failed to render")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).not.toContainText("Application error");

  await assertNoResumeErrors(pageErrors, consoleErrors);
});
