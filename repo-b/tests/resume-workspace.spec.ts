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

  await expect(page.getByRole("heading", { name: "Paul Malmquist Resume", exact: true })).toBeVisible();
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

test("visual resume links KPI anchors and capability layers to contextual evidence", async ({ page }) => {
  test.setTimeout(60_000);

  await page.addInitScript(() => {
    window.localStorage.setItem("bm_theme_mode", "dark");
  });

  await installResumeMocks(page, makeResumeWorkspacePayload());

  await page.goto(`/lab/env/${RESUME_ENV_ID}/resume`, { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: /Properties Integrated/i }).click();
  await expect(page).toHaveURL(new RegExp(`metric=properties_integrated`));
  await expect(page.getByText("Scale stops being a bullet point and becomes evidence of operating leverage.")).toBeVisible();

  await page.getByRole("button", { name: "Capability", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`view=capability`));
  await page.getByRole("button", { name: /AI \/ Agentic Systems/i }).click();
  await expect(page.getByText("Winston as a parallel proof point")).toBeVisible();

  await page.getByRole("button", { name: "Clear Selection" }).click();
  await expect(page).not.toHaveURL(/layer=ai_agentic|metric=properties_integrated/);
  await expect(page.getByText("Story Evidence")).toBeVisible();
});

test("visual resume restores URL state and story controls walk milestones in order", async ({ page }) => {
  test.setTimeout(60_000);

  await page.addInitScript(() => {
    window.localStorage.setItem("bm_theme_mode", "dark");
  });

  await installResumeMocks(page, makeResumeWorkspacePayload());

  await page.goto(`/lab/env/${RESUME_ENV_ID}/resume?view=career&phase=phase-jll-2014-2018`, { waitUntil: "domcontentloaded" });

  await expect(page.getByText("This selection has limited authored evidence so far. The summary above remains the active fallback until more cards are added.")).toBeVisible();

  await page.getByRole("button", { name: "Restart" }).click();
  await expect(page).toHaveURL(new RegExp(`milestone=milestone-joined-jll-2014`));

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(new RegExp(`milestone=milestone-expanded-bi-scope`));
});

test("visual resume exposes mobile context sections without overflow", async ({ page }, testInfo) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "Mobile coverage only");
  test.setTimeout(60_000);

  await page.addInitScript(() => {
    window.localStorage.setItem("bm_theme_mode", "dark");
  });

  await installResumeMocks(page, makeResumeWorkspacePayload());

  await page.goto(`/lab/env/${RESUME_ENV_ID}/resume`, { waitUntil: "domcontentloaded" });

  await expect(page.getByText("Context Rail")).toBeVisible();
  await expect(page.getByText("Winston")).toBeVisible();
  await page.getByText("Winston").click();
  await expect(page.getByText("Context-aware explanation layer")).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);

  await page.screenshot({
    path: testInfo.outputPath("resume-mobile.png"),
    fullPage: true,
  });
});
