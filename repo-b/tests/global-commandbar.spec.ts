import { type BrowserContext, type Page, expect, test } from "@playwright/test";

function mockContextSnapshot() {
  return {
    route: "/lab/environments",
    environments: [{ env_id: "env_1", client_name: "Acme" }],
    selectedEnv: { env_id: "env_1", client_name: "Acme", business_id: "biz_1" },
    business: { business_id: "biz_1", name: "Acme Holdings", slug: "acme" },
    modulesAvailable: ["environments", "tasks"],
    recentRuns: [],
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

async function mockWinstonFirstMile(page: Page, options: {
  scopeType: "fund" | "environment";
  scopeId: string | null;
  scopeLabel: string;
  route: string;
}) {
  const askPayloads: any[] = [];

  await page.route("**/api/ai/gateway/conversations**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ conversations: [] }),
      });
      return;
    }

    const body = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        conversation_id: "convo_test",
        business_id: "biz_1",
        env_id: "env_1",
        title: options.scopeLabel,
        thread_kind: "contextual",
        scope_type: options.scopeType,
        scope_id: options.scopeId,
        scope_label: options.scopeLabel,
        launch_source: "winston_companion_contextual",
        context_summary: options.scopeLabel,
        last_route: body.last_route || options.route,
        messages: [],
      }),
    });
  });

  await page.route("**/api/ai/gateway/ask", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    askPayloads.push(body);
    const isFollowUp = askPayloads.length > 1;
    const text = isFollowUp
      ? "Still using the same scoped conversation."
      : "I have the right scope and can continue from here.";
    const sse = [
      `event: token\ndata: ${JSON.stringify({ text })}\n`,
      `event: done\ndata: ${JSON.stringify({ terminal_state: "complete" })}\n`,
      "",
    ].join("\n");
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: sse,
    });
  });

  return askPayloads;
}

test.describe("Winston companion", () => {
  test("renders the floating launcher, traps focus in the drawer, and closes on escape", async ({ page, context, baseURL }) => {
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
    const launcher = page.getByTestId("global-commandbar-toggle");
    const composer = page.getByTestId("global-commandbar-input");

    await expect(launcher).toBeVisible();

    const dialog = page.getByRole("dialog", { name: "Winston companion" });

    await launcher.click();
    await expect(dialog).toBeVisible();
    await expect(composer).toBeFocused();
    await page.keyboard.type("why now");
    await expect(composer).toHaveValue("why now");

    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");

    const focusInDialog = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="Winston companion"]');
      return Boolean(dialog?.contains(document.activeElement));
    });
    expect(focusInDialog).toBeTruthy();

    await expect(composer).toBeVisible();
    await expect(page.getByTestId("global-commandbar-output")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(launcher).toHaveAttribute("aria-label", "Open Winston companion");
    await expect(dialog).toHaveClass(/translate-x-full/);
    await expect(launcher).toBeFocused();
  });

  test("suppresses the launcher on public routes", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("global-commandbar-toggle")).toHaveCount(0);
  });

  test("honors the winston-prefill-prompt event shim", async ({ page, context, baseURL }) => {
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
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("winston-prefill-prompt", {
          detail: { prompt: "Summarize the current workspace context." },
        }),
      );
    });

    await expect(page.getByRole("dialog", { name: "Winston companion" })).toBeVisible();
    await expect(page.getByTestId("global-commandbar-input")).toHaveValue("Summarize the current workspace context.");
  });

  test("boots on the RE fund detail surface and preserves scope into the immediate follow-up turn", async ({ page, context, baseURL }) => {
    if (!baseURL) throw new Error("baseURL missing");
    await seedAuthCookie(baseURL, context);

    const askPayloads = await mockWinstonFirstMile(page, {
      scopeType: "fund",
      scopeId: "fund_1",
      scopeLabel: "Institutional Growth Fund VII",
      route: "/lab/env/env_1/re/funds/fund_1",
    });

    await page.route("**/api/mcp/context-snapshot**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          route: "/lab/env/env_1/re/funds/fund_1",
          environments: [{ env_id: "env_1", client_name: "Meridian Capital Management", business_id: "biz_1" }],
          selectedEnv: { env_id: "env_1", client_name: "Meridian Capital Management", business_id: "biz_1" },
          business: { business_id: "biz_1", name: "Meridian Capital Management", slug: "meridian" },
          modulesAvailable: ["re"],
          recentRuns: [],
        }),
      });
    });

    await page.goto("/lab/environments");
    await page.evaluate(() => {
      window.__APP_CONTEXT__ = {
        environment: {
          active_environment_id: "env_1",
          active_environment_name: "Meridian Capital Management",
          active_business_id: "biz_1",
          active_business_name: "Meridian Capital Management",
        },
        page: {
          route: "/lab/env/env_1/re/funds/fund_1",
          surface: "fund_detail",
          active_module: "re",
          page_entity_type: "fund",
          page_entity_id: "fund_1",
          page_entity_name: "Institutional Growth Fund VII",
          selected_entities: [
            { entity_type: "fund", entity_id: "fund_1", name: "Institutional Growth Fund VII", source: "page" },
          ],
          visible_data: null,
        },
        updated_at: Date.now(),
      };
      window.dispatchEvent(new CustomEvent("bm:assistant-context-updated", { detail: window.__APP_CONTEXT__ }));
    });

    await expect(page.getByTestId("global-commandbar-toggle")).toBeVisible();
    await page.getByTestId("global-commandbar-toggle").click();
    await page.getByTestId("global-commandbar-input").fill("give me a summary of this fund please");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("I have the right scope and can continue from here.")).toBeVisible();
    await expect(page.getByText("Something went wrong starting the conversation. Please try again.")).toHaveCount(0);

    await page.getByTestId("global-commandbar-input").fill("keep going");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Still using the same scoped conversation.")).toBeVisible();
    await expect
      .poll(() => askPayloads.length, { timeout: 10_000 })
      .toBe(2);
    expect(askPayloads[0]?.conversation_id).toBe("convo_test");
    expect(askPayloads[0]?.context_envelope?.thread?.scope_type).toBe("fund");
    expect(askPayloads[0]?.context_envelope?.thread?.scope_id).toBe("fund_1");
    expect(askPayloads[1]?.conversation_id).toBe("convo_test");
    expect(askPayloads[1]?.context_envelope?.thread?.scope_type).toBe("fund");
    expect(askPayloads[1]?.context_envelope?.thread?.scope_id).toBe("fund_1");
  });

  test("boots on the RE environment overview surface without showing a bootstrap error", async ({ page, context, baseURL }) => {
    if (!baseURL) throw new Error("baseURL missing");
    await seedAuthCookie(baseURL, context);

    await mockWinstonFirstMile(page, {
      scopeType: "environment",
      scopeId: "env_1",
      scopeLabel: "Meridian Capital Management",
      route: "/lab/env/env_1/re",
    });

    await page.route("**/api/mcp/context-snapshot**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          route: "/lab/env/env_1/re",
          environments: [{ env_id: "env_1", client_name: "Meridian Capital Management", business_id: "biz_1" }],
          selectedEnv: { env_id: "env_1", client_name: "Meridian Capital Management", business_id: "biz_1" },
          business: { business_id: "biz_1", name: "Meridian Capital Management", slug: "meridian" },
          modulesAvailable: ["re"],
          recentRuns: [],
        }),
      });
    });

    await page.goto("/lab/environments");
    await page.evaluate(() => {
      window.__APP_CONTEXT__ = {
        environment: {
          active_environment_id: "env_1",
          active_environment_name: "Meridian Capital Management",
          active_business_id: "biz_1",
          active_business_name: "Meridian Capital Management",
        },
        page: {
          route: "/lab/env/env_1/re",
          surface: "re_workspace",
          active_module: "re",
          page_entity_type: "environment",
          page_entity_id: "env_1",
          page_entity_name: "Meridian Capital Management",
          selected_entities: [],
          visible_data: null,
        },
        updated_at: Date.now(),
      };
      window.dispatchEvent(new CustomEvent("bm:assistant-context-updated", { detail: window.__APP_CONTEXT__ }));
    });

    await expect(page.getByTestId("global-commandbar-toggle")).toBeVisible();
    await page.getByTestId("global-commandbar-toggle").click();
    await page.getByTestId("global-commandbar-input").fill("give me a summary of the funds please");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("I have the right scope and can continue from here.")).toBeVisible();
    await expect(page.getByText("Something went wrong starting the conversation. Please try again.")).toHaveCount(0);
  });
});
