import { type BrowserContext, expect, test } from "@playwright/test";

function mockContextSnapshot() {
  return {
    route: "/lab/environments",
    environments: [{ env_id: "env_1", client_name: "Acme" }],
    selectedEnv: { env_id: "env_1", client_name: "Acme" },
    business: { business_id: "biz_1", name: "Acme Holdings", slug: "acme" },
    modulesAvailable: ["environments", "tasks"],
    recentRuns: [],
  };
}

function mockPlan() {
  const createdAt = Date.now();
  return {
    plan_id: "plan_1",
    risk: "low",
    mutations: [],
    requires_confirmation: true,
    requires_double_confirmation: false,
    double_confirmation_phrase: null,
    plan: {
      planId: "plan_1",
      intentSummary: "List environments",
      intent: {
        rawMessage: "List environments and highlight any needing attention.",
        domain: "lab",
        resource: "environments",
        action: "list",
        parameters: {},
        confidence: 0.9,
        readOnly: true,
      },
      operationName: "lab.environments.list",
      operationParams: { envId: "env_1" },
      steps: [
        {
          id: "step_1",
          title: "Read environments",
          description: "Calls the environment list endpoint.",
          mutation: false,
        },
      ],
      impactedEntities: ["environments"],
      mutations: [],
      risk: "low",
      readOnly: true,
      requiresConfirmation: true,
      requiresDoubleConfirmation: false,
      doubleConfirmationPhrase: null,
      target: { envId: "env_1", envName: "Acme", businessId: "biz_1" },
      clarification: { needed: false },
      context: {
        currentEnvId: "env_1",
        currentBusinessId: "biz_1",
        route: "/lab/environments",
        selection: null,
      },
      createdAt,
    },
  };
}

async function seedAuthCookie(baseURL: string, context: BrowserContext) {
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
}

test.describe("Winston command center", () => {
  test("renders, traps focus, and supports keyboard close", async ({ page, context, baseURL }) => {
    if (!baseURL) throw new Error("baseURL missing");
    await seedAuthCookie(baseURL, context);

    await page.route("**/api/mcp/context-snapshot**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockContextSnapshot()),
      });
    });

    await page.goto("/lab/environments");
    await page.getByTestId("global-commandbar-toggle").click();

    await expect(page.getByRole("dialog", { name: "Winston command center" })).toBeVisible();

    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press("Tab");
    }

    const focusInDialog = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="Winston command center"]');
      return Boolean(dialog?.contains(document.activeElement));
    });
    expect(focusInDialog).toBeTruthy();

    const emptyStateShot = await page.getByTestId("global-commandbar-output").screenshot();
    expect(emptyStateShot.byteLength).toBeGreaterThan(1000);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Winston command center" })).toBeHidden();
  });

  test("quick action goes Plan -> Confirm -> Execute", async ({ page, context, baseURL }) => {
    if (!baseURL) throw new Error("baseURL missing");
    await seedAuthCookie(baseURL, context);

    let runPoll = 0;

    await page.route("**/api/mcp/context-snapshot**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockContextSnapshot()),
      });
    });

    await page.route("**/api/mcp/plan", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockPlan()),
      });
    });

    await page.route("**/api/commands/confirm", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          confirm_token: "confirm_1",
          expires_at: new Date(Date.now() + 300_000).toISOString(),
          plan: mockPlan().plan,
        }),
      });
    });

    await page.route("**/api/commands/execute", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ run_id: "run_1", status: "running" }),
      });
    });

    await page.route("**/api/commands/runs/*", async (route) => {
      runPoll += 1;
      const done = runPoll > 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          run: {
            runId: "run_1",
            planId: "plan_1",
            status: done ? "completed" : "running",
            createdAt: Date.now(),
            startedAt: Date.now(),
            endedAt: done ? Date.now() : undefined,
            cancelled: false,
            logs: done ? ["Execution started", "Run completed."] : ["Execution started"],
            stepResults: [
              {
                stepId: "step_1",
                status: done ? "completed" : "running",
              },
            ],
            verification: done
              ? [
                  {
                    stepId: "step_1",
                    ok: true,
                    summary: "Discovery complete",
                    links: [{ label: "Open environments page", href: "/lab/environments" }],
                  },
                ]
              : [],
          },
          plan: {
            plan_id: "plan_1",
            risk: "low",
            read_only: true,
            intent_summary: "List environments",
            impacted_entities: ["environments"],
            mutations: [],
            target: null,
            clarification: null,
            requires_double_confirmation: false,
            double_confirmation_phrase: null,
          },
          audit_events: [],
        }),
      });
    });

    await page.goto("/lab/environments");
    await page.getByTestId("global-commandbar-toggle").click();
    await page.getByTestId("quick-action-list-environments").click();

    await expect(page.getByRole("button", { name: "Continue to Confirm" })).toBeVisible();
    const planShot = await page.getByText("Preview Diff", { exact: true }).locator("..").screenshot();
    expect(planShot.byteLength).toBeGreaterThan(1000);

    await page.getByRole("button", { name: "Continue to Confirm" }).click();
    await page.getByRole("button", { name: "Confirm and Execute" }).click();

    await expect(page.getByText("Execution complete.")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId("execute-logs")).toContainText("Run completed");
  });

  test("unauthenticated users see limited behavior and clear messaging", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("global-commandbar-toggle").click();

    await expect(page.getByText("Authentication required to run commands")).toBeVisible();
    await expect(page.getByTestId("global-commandbar-input")).toBeDisabled();
  });

  test("handles malformed plan payload with friendly message", async ({ page, context, baseURL }) => {
    if (!baseURL) throw new Error("baseURL missing");
    await seedAuthCookie(baseURL, context);

    await page.route("**/api/mcp/context-snapshot**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockContextSnapshot()),
      });
    });

    await page.route("**/api/mcp/plan", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ plan_id: "bad" }),
      });
    });

    await page.goto("/lab/environments");
    await page.getByTestId("global-commandbar-toggle").click();
    await page.getByTestId("quick-action-list-environments").click();

    await expect(page.getByTestId("global-commandbar-output")).toContainText("unexpected response format");
  });

  test("handles planning timeout and shows failure state", async ({ page, context, baseURL }) => {
    if (!baseURL) throw new Error("baseURL missing");
    await seedAuthCookie(baseURL, context);

    await page.route("**/api/mcp/context-snapshot**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockContextSnapshot()),
      });
    });

    await page.route("**/api/mcp/plan", async (route) => {
      await route.fulfill({
        status: 504,
        contentType: "application/json",
        body: JSON.stringify({ error: "Planner timeout" }),
      });
    });

    await page.goto("/lab/environments");
    await page.getByTestId("global-commandbar-toggle").click();
    await page.getByTestId("quick-action-list-environments").click();

    await expect(page.getByTestId("global-commandbar-output")).toContainText("Planner timeout");
  });

  test("diagnostics surfaces gateway and permission failures", async ({ page, context, baseURL }) => {
    if (!baseURL) throw new Error("baseURL missing");
    await seedAuthCookie(baseURL, context);

    await page.route("**/api/mcp/context-snapshot**", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Authentication required" }),
      });
    });

    await page.route("**/api/ai/gateway/health", async (route) => {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "AI Gateway unavailable." }),
      });
    });

    await page.goto("/lab/environments");
    await page.getByTestId("global-commandbar-toggle").click();
    await page.getByRole("button", { name: "Advanced / Debug" }).click();
    await page.getByRole("button", { name: "Diagnostics" }).click();

    await expect(page.getByText("AI Gateway health")).toBeVisible();
    await expect(page.getByText("Authentication required to run commands")).toBeVisible();
  });
});
