import { test, expect } from "@playwright/test";

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

  const envId = "11111111-1111-4111-8111-111111111111";
  const businessId = "22222222-2222-4222-8222-222222222222";

  let queueItems = [
    {
      queue_item_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      env_id: envId,
      business_id: businessId,
      decision_code: "D07",
      title: "Project escalation required",
      summary: "2 projects breached cost threshold",
      priority: "high",
      status: "open",
      project_id: null,
      signal_event_id: null,
      recommended_action: "Escalate projects",
      recommended_owner: "Exec",
      due_at: null,
      risk_score: "7.5",
      context_json: {},
      ai_analysis_json: {},
      input_snapshot_json: {},
      outcome_json: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  let drafts: Array<Record<string, unknown>> = [];

  await page.route("**/v1/environments/**", async (route) => {
    await route.fulfill({
      json: {
        env_id: envId,
        client_name: "BuildCo Environment",
        industry: "construction",
        industry_type: "construction",
        schema_name: "env_buildco",
        is_active: true,
      },
    });
  });

  await page.route("**/api/pds/v1/context**", async (route) => {
    await route.fulfill({
      json: {
        env_id: envId,
        business_id: businessId,
        created: false,
        source: "test",
        diagnostics: {},
      },
    });
  });

  await page.route("**/api/pds/v1/executive/overview**", async (route) => {
    await route.fulfill({
      json: {
        env_id: envId,
        business_id: businessId,
        decisions_total: 20,
        open_queue: queueItems.length,
        critical_queue: 1,
        high_queue: 1,
        open_signals: 3,
        high_signals: 1,
        latest_kpi: null,
      },
    });
  });

  await page.route("**/api/pds/v1/executive/queue**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: queueItems });
      return;
    }
    await route.continue();
  });

  await page.route("**/api/pds/v1/executive/memory**", async (route) => {
    await route.fulfill({ json: { items: [] } });
  });

  await page.route("**/api/pds/v1/executive/messaging/drafts**", async (route) => {
    await route.fulfill({ json: drafts });
  });

  await page.route("**/api/pds/v1/executive/runs/connectors**", async (route) => {
    await route.fulfill({ json: { connector_keys: [], runs: [] } });
  });

  await page.route("**/api/pds/v1/executive/runs/full**", async (route) => {
    await route.fulfill({
      json: {
        connectors: { runs: [] },
        decision_engine: { evaluated: 20, triggered: 4 },
        kpi_daily: {},
      },
    });
  });

  await page.route("**/api/pds/v1/executive/queue/*/actions**", async (route) => {
    queueItems = [];
    await route.fulfill({
      json: {
        queue_item: { queue_item_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "approved" },
        action: { action_type: "approve" },
      },
    });
  });

  await page.route("**/api/pds/v1/executive/messaging/generate**", async (route) => {
    drafts = [
      {
        draft_id: "d1",
        draft_type: "internal_memo",
        title: "Internal Memo",
        body_text: "AI supports better project delivery outcomes.",
        status: "draft",
      },
    ];
    await route.fulfill({ json: drafts });
  });

  await page.route("**/api/pds/v1/executive/messaging/*/approve**", async (route) => {
    drafts = drafts.map((d) => ({ ...d, status: "approved" }));
    await route.fulfill({ json: drafts[0] });
  });

  await page.route("**/api/pds/v1/executive/briefings/generate**", async (route) => {
    await route.fulfill({
      json: {
        briefing_pack_id: "b1",
        briefing_type: "board",
        period: "2026-03",
        title: "Board Briefing - 2026-03",
        summary_text: "Executive automation improved risk visibility.",
      },
    });
  });
});

test("pds executive queue, messaging, and briefing flows", async ({ page }) => {
  const envId = "11111111-1111-4111-8111-111111111111";
  await page.goto(`/lab/env/${envId}/pds/executive`);

  await expect(page.getByTestId("pds-executive-page")).toBeVisible();
  await expect(page.getByText("PDS Executive Overview")).toBeVisible();

  await expect(page.getByTestId("pds-executive-queue")).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).first().click();

  await page.getByRole("button", { name: "Strategic Messaging" }).click();
  await expect(page.getByTestId("pds-executive-messaging")).toBeVisible();
  await page.getByRole("button", { name: "Generate Drafts" }).click();
  await expect(page.getByText("Internal Memo")).toBeVisible();

  await page.getByRole("button", { name: "Board / Investor" }).click();
  await expect(page.getByTestId("pds-executive-briefings")).toBeVisible();
  await page.getByRole("button", { name: "Generate Board Pack" }).click();
  await expect(page.getByText("Board Briefing - 2026-03")).toBeVisible();
});
