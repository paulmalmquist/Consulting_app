import { expect, test } from "@playwright/test";

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

  await page.route("**/v1/environments/44444444-4444-4444-8444-444444444444", async (route) => {
    await route.fulfill({
      json: {
        env_id: "44444444-4444-4444-8444-444444444444",
        client_name: "BuildCo Environment",
        industry: "construction",
        industry_type: "construction",
        schema_name: "env_buildco",
        business_id: "55555555-5555-4555-8555-555555555555",
      },
    });
  });

  await page.route("**/api/opportunity-engine/v1/context**", async (route) => {
    await route.fulfill({
      json: {
        env_id: "44444444-4444-4444-8444-444444444444",
        business_id: "55555555-5555-4555-8555-555555555555",
        created: false,
        source: "test",
        diagnostics: {},
      },
    });
  });

  await page.route("**/api/opportunity-engine/v1/dashboard**", async (route) => {
    await route.fulfill({
      json: {
        latest_run: null,
        recommendation_counts: { consulting: 1, market_intel: 1 },
        top_recommendations: [],
        top_signals: [],
        run_history: [],
      },
    });
  });

  await page.route("**/api/opportunity-engine/v1/recommendations/rec-1**", async (route) => {
    await route.fulfill({
      json: {
        recommendation_id: "rec-1",
        run_id: "run-1",
        opportunity_score_id: "score-1",
        business_line: "consulting",
        entity_type: "crm_opportunity",
        entity_id: "opp-1",
        entity_key: "opp-1",
        recommendation_type: "pipeline_action",
        title: "Advance Acme opportunity",
        summary: "High-probability consulting motion.",
        suggested_action: "Prepare sponsor brief.",
        action_owner: "consulting_operator",
        priority: "high",
        sector: "construction",
        geography: null,
        confidence: 0.81,
        why_json: {},
        driver_summary: "Lead Score",
        created_at: "2026-03-09T00:00:00Z",
        updated_at: "2026-03-09T00:00:00Z",
        score: 88.4,
        probability: 0.81,
        expected_value: 96000,
        rank_position: 1,
        model_version: "opportunity_engine_v1",
        fallback_mode: null,
        drivers: [],
        score_history: [{ as_of_date: "2026-03-09", score: 88.4, probability: 0.81 }],
        linked_signals: [],
        linked_forecasts: [],
      },
    });
  });

  await page.route("**/api/opportunity-engine/v1/recommendations**", async (route) => {
    await route.fulfill({
      json: [
        {
          recommendation_id: "rec-1",
          run_id: "run-1",
          opportunity_score_id: "score-1",
          business_line: "consulting",
          entity_type: "crm_opportunity",
          entity_id: "opp-1",
          entity_key: "opp-1",
          recommendation_type: "pipeline_action",
          title: "Advance Acme opportunity",
          summary: "High-probability consulting motion.",
          suggested_action: "Prepare sponsor brief.",
          action_owner: "consulting_operator",
          priority: "high",
          sector: "construction",
          geography: null,
          confidence: 0.81,
          why_json: {},
          driver_summary: "Lead Score",
          created_at: "2026-03-09T00:00:00Z",
          updated_at: "2026-03-09T00:00:00Z",
          score: 88.4,
          probability: 0.81,
          expected_value: 96000,
          rank_position: 1,
          model_version: "opportunity_engine_v1",
          fallback_mode: null,
        },
      ],
    });
  });

  await page.route("**/api/opportunity-engine/v1/signals**", async (route) => {
    await route.fulfill({
      json: [
        {
          market_signal_id: "sig-1",
          run_id: "run-1",
          signal_source: "kalshi_markets",
          source_market_id: "KAL-RATES",
          signal_key: "kalshi_markets:KAL-RATES:rates_easing",
          signal_name: "Will the Fed cut rates by September 2026?",
          canonical_topic: "rates_easing",
          business_line: "market_intel",
          sector: "macro",
          geography: "United States",
          signal_direction: "bullish",
          probability: 0.63,
          signal_strength: 0.26,
          confidence: 0.68,
          observed_at: "2026-03-09T00:00:00Z",
          expires_at: null,
          metadata_json: {},
          explanation_json: {},
          created_at: "2026-03-09T00:00:00Z",
        },
      ],
    });
  });

  await page.route("**/api/opportunity-engine/v1/runs", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 201,
        json: {
          run_id: "run-2",
          env_id: "44444444-4444-4444-8444-444444444444",
          business_id: "55555555-5555-4555-8555-555555555555",
          run_type: "manual",
          mode: "fixture",
          model_version: "opportunity_engine_v1",
          status: "success",
          business_lines: ["consulting", "pds", "re_investment", "market_intel"],
          triggered_by: "opportunity-engine-ui",
          input_hash: "hash",
          parameters_json: {},
          metrics_json: {},
          error_summary: null,
          started_at: "2026-03-09T00:00:00Z",
          finished_at: "2026-03-09T00:00:05Z",
          created_at: "2026-03-09T00:00:00Z",
          updated_at: "2026-03-09T00:00:05Z",
        },
      });
      return;
    }
    await route.fulfill({
      json: [
        {
          run_id: "run-1",
          env_id: "44444444-4444-4444-8444-444444444444",
          business_id: "55555555-5555-4555-8555-555555555555",
          run_type: "manual",
          mode: "fixture",
          model_version: "opportunity_engine_v1",
          status: "success",
          business_lines: ["consulting", "market_intel"],
          triggered_by: "tester",
          input_hash: "hash",
          parameters_json: {},
          metrics_json: {},
          error_summary: null,
          started_at: "2026-03-09T00:00:00Z",
          finished_at: "2026-03-09T00:00:05Z",
          created_at: "2026-03-09T00:00:00Z",
          updated_at: "2026-03-09T00:00:05Z",
        },
      ],
    });
  });
});

test("loads the Opportunity Engine workspace and opens recommendation detail", async ({ page }) => {
  await page.goto("/lab/env/44444444-4444-4444-8444-444444444444/opportunity-engine");

  await expect(page.getByText("Ranked project and market recommendations")).toBeVisible();
  await expect(page.getByText("Advance Acme opportunity")).toBeVisible();
  await expect(page.getByText("Will the Fed cut rates by September 2026?")).toBeVisible();

  await page.getByRole("button", { name: /Advance Acme opportunity/i }).click();
  await expect(page.getByRole("dialog", { name: /Advance Acme opportunity/i })).toBeVisible();
});
