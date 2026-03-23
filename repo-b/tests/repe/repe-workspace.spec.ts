import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { initializeRunContext, makeRunId, makeStepLogger } from "../helpers/repeE2e";

type MockState = {
  partitionId: string;
  businessId: string;
  funds: Array<{ fin_fund_id: string; name: string; fund_code: string; strategy: string; pref_rate: string; carry_rate: string; waterfall_style: "american" | "european"; business_id: string; partition_id: string; created_at: string }>;
  participants: Array<{ fin_participant_id: string; business_id: string; name: string; participant_type: string; created_at: string }>;
  commitments: Record<string, Array<{ fin_commitment_id: string; fin_participant_id: string; participant_name: string; commitment_role: string; commitment_date: string; committed_amount: string }>>;
  capitalCalls: Record<string, Array<{ fin_capital_call_id: string; call_number: number; call_date: string; amount_requested: string; status: string }>>;
  assets: Record<string, Array<{ fin_asset_investment_id: string; asset_name: string; acquisition_date: string; cost_basis: string; status: string }>>;
  distributionEvents: Record<string, Array<{ fin_distribution_event_id: string; event_date: string; gross_proceeds: string; net_distributable: string; event_type: string; status: string; asset_name?: string }>>;
  payouts: Record<string, Array<{ fin_distribution_payout_id: string; fin_participant_id: string; participant_name: string; payout_type: string; amount: string; payout_date: string }>>;
  runByIdempotencyKey: Record<string, string>;
  seenRunHeaders: string[];
};

function makeState(): MockState {
  return {
    partitionId: "00000000-0000-0000-0000-000000000001",
    businessId: "11111111-1111-1111-1111-111111111111",
    funds: [],
    participants: [],
    commitments: {},
    capitalCalls: {},
    assets: {},
    distributionEvents: {},
    payouts: {},
    runByIdempotencyKey: {},
    seenRunHeaders: [],
  };
}

async function installRepeApiMocks(context: BrowserContext, runId: string, state: MockState): Promise<void> {
  await context.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const path = url.pathname;
    const headers = req.headers();

    if (path.startsWith("/api/fin/v1/")) {
      state.seenRunHeaders.push(headers["x-run-id"] || "");
    }

    const fulfillJson = async (body: unknown, status = 200) => {
      await route.fulfill({
        status,
        headers: {
          "content-type": "application/json",
          "x-request-id": headers["x-request-id"] || `req_${Date.now()}`,
          ...(headers["x-run-id"] ? { "x-run-id": headers["x-run-id"] } : {}),
        },
        body: JSON.stringify(body),
      });
    };

    if (path === `/api/businesses/${state.businessId}/departments`) {
      return fulfillJson([]);
    }
    if (path.includes(`/api/businesses/${state.businessId}/departments/`) && path.endsWith("/capabilities")) {
      return fulfillJson([]);
    }

    if (path === "/api/fin/v1/partitions" && method === "GET") {
      return fulfillJson([
        {
          partition_id: state.partitionId,
          tenant_id: "22222222-2222-2222-2222-222222222222",
          business_id: state.businessId,
          key: "live",
          partition_type: "live",
          is_read_only: false,
          status: "active",
          created_at: "2028-01-01T00:00:00",
        },
      ]);
    }

    if (path === "/api/fin/v1/funds" && method === "GET") {
      return fulfillJson(state.funds);
    }
    if (path === "/api/fin/v1/funds" && method === "POST") {
      const body = req.postDataJSON() as Record<string, string>;
      const row = {
        fin_fund_id: `fund-${Date.now()}`,
        business_id: state.businessId,
        partition_id: state.partitionId,
        fund_code: body.fund_code,
        name: body.name,
        strategy: body.strategy,
        pref_rate: body.pref_rate,
        carry_rate: body.carry_rate,
        waterfall_style: (body.waterfall_style as "american" | "european") || "american",
        created_at: "2028-01-01T00:00:00",
      };
      state.funds.unshift(row);
      return fulfillJson(row);
    }

    if (path === "/api/fin/v1/participants" && method === "GET") {
      const participantType = url.searchParams.get("participant_type");
      if (participantType) {
        return fulfillJson(state.participants.filter((row) => row.participant_type === participantType));
      }
      return fulfillJson(state.participants);
    }
    if (path === "/api/fin/v1/participants" && method === "POST") {
      const body = req.postDataJSON() as Record<string, string>;
      const row = {
        fin_participant_id: `participant-${Date.now()}`,
        business_id: state.businessId,
        name: body.name,
        participant_type: body.participant_type,
        created_at: "2028-01-01T00:00:00",
      };
      state.participants.push(row);
      return fulfillJson(row);
    }

    const fundCommitments = path.match(/^\/api\/fin\/v1\/funds\/([^/]+)\/commitments$/);
    if (fundCommitments && method === "GET") {
      return fulfillJson(state.commitments[fundCommitments[1]] || []);
    }
    if (fundCommitments && method === "POST") {
      const fundId = fundCommitments[1];
      const body = req.postDataJSON() as Record<string, string>;
      const participant = state.participants.find((row) => row.fin_participant_id === body.fin_participant_id);
      const row = {
        fin_commitment_id: `commitment-${Date.now()}`,
        fin_participant_id: body.fin_participant_id,
        participant_name: participant?.name || body.fin_participant_id,
        commitment_role: body.commitment_role,
        commitment_date: body.commitment_date,
        committed_amount: body.committed_amount,
      };
      state.commitments[fundId] = [...(state.commitments[fundId] || []), row];
      return fulfillJson(row);
    }

    const fundCapitalCalls = path.match(/^\/api\/fin\/v1\/funds\/([^/]+)\/capital-calls$/);
    if (fundCapitalCalls && method === "GET") {
      return fulfillJson(state.capitalCalls[fundCapitalCalls[1]] || []);
    }
    if (fundCapitalCalls && method === "POST") {
      const fundId = fundCapitalCalls[1];
      const body = req.postDataJSON() as Record<string, string>;
      const row = {
        fin_capital_call_id: `capital-call-${Date.now()}`,
        call_number: (state.capitalCalls[fundId]?.length || 0) + 1,
        call_date: body.call_date,
        amount_requested: body.amount_requested,
        status: "open",
      };
      state.capitalCalls[fundId] = [...(state.capitalCalls[fundId] || []), row];
      return fulfillJson(row);
    }

    const fundAssets = path.match(/^\/api\/fin\/v1\/funds\/([^/]+)\/assets$/);
    if (fundAssets && method === "GET") {
      return fulfillJson(state.assets[fundAssets[1]] || []);
    }
    if (fundAssets && method === "POST") {
      const fundId = fundAssets[1];
      const body = req.postDataJSON() as Record<string, string>;
      const row = {
        fin_asset_investment_id: `asset-${Date.now()}`,
        asset_name: body.asset_name,
        acquisition_date: body.acquisition_date,
        cost_basis: body.cost_basis,
        status: "active",
      };
      state.assets[fundId] = [...(state.assets[fundId] || []), row];
      return fulfillJson(row);
    }

    const fundDistribution = path.match(/^\/api\/fin\/v1\/funds\/([^/]+)\/distribution-events$/);
    if (fundDistribution && method === "GET") {
      return fulfillJson(state.distributionEvents[fundDistribution[1]] || []);
    }
    if (fundDistribution && method === "POST") {
      const fundId = fundDistribution[1];
      const body = req.postDataJSON() as Record<string, string>;
      const asset = (state.assets[fundId] || []).find((row) => row.fin_asset_investment_id === body.fin_asset_investment_id);
      const row = {
        fin_distribution_event_id: `distribution-${Date.now()}`,
        event_date: body.event_date,
        gross_proceeds: body.gross_proceeds,
        net_distributable: body.net_distributable || body.gross_proceeds,
        event_type: body.event_type,
        status: "open",
        asset_name: asset?.asset_name,
      };
      state.distributionEvents[fundId] = [...(state.distributionEvents[fundId] || []), row];
      return fulfillJson(row);
    }

    const payouts = path.match(/^\/api\/fin\/v1\/funds\/([^/]+)\/distribution-events\/([^/]+)\/payouts$/);
    if (payouts && method === "GET") {
      const distributionEventId = payouts[2];
      return fulfillJson(state.payouts[distributionEventId] || []);
    }

    const waterfall = path.match(/^\/api\/fin\/v1\/funds\/([^/]+)\/waterfall-runs$/);
    if (waterfall && method === "POST") {
      const fundId = waterfall[1];
      const body = req.postDataJSON() as Record<string, string>;
      const idem = body.idempotency_key;
      const runId = state.runByIdempotencyKey[idem] || `run-${Date.now()}`;
      state.runByIdempotencyKey[idem] = runId;

      const dist = (state.distributionEvents[fundId] || []).find((row) => row.fin_distribution_event_id === body.distribution_event_id);
      const payoutRow = {
        fin_distribution_payout_id: `payout-${Date.now()}`,
        fin_participant_id: state.participants[0]?.fin_participant_id || "none",
        participant_name: state.participants[0]?.name || "LP",
        payout_type: "return_of_capital",
        amount: dist?.net_distributable || "0",
        payout_date: dist?.event_date || "2028-01-01",
      };
      state.payouts[body.distribution_event_id] = [payoutRow];

      return fulfillJson({
        run: {
          fin_run_id: runId,
          tenant_id: "22222222-2222-2222-2222-222222222222",
          business_id: state.businessId,
          partition_id: state.partitionId,
          engine_kind: "waterfall",
          status: "completed",
          deterministic_hash: "hash",
          as_of_date: body.as_of_date,
          idempotency_key: idem,
          input_ref_table: "fin_distribution_event",
          input_ref_id: body.distribution_event_id,
          started_at: "2028-01-01T00:00:00",
          completed_at: "2028-01-01T00:00:01",
          error_message: null,
          created_at: "2028-01-01T00:00:00",
        },
        result_refs: [{ result_table: "fin_allocation_run", result_id: `alloc-${Date.now()}` }],
      });
    }

    const allocations = path.match(/^\/api\/fin\/v1\/funds\/([^/]+)\/waterfall-runs\/([^/]+)\/allocations$/);
    if (allocations && method === "GET") {
      return fulfillJson([{ line_number: 1, label: "return_of_capital", amount: "100" }]);
    }

    return fulfillJson({ ok: true });
  });
}

async function setBusinessContext(page: Page, businessId: string): Promise<void> {
  await page.goto("/");
  await page.evaluate((id) => {
    localStorage.setItem("bos_business_id", id);
  }, businessId);
}

function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

test("Flow 1: First Entry create fund", async ({ context, page }) => {
  const runId = makeRunId();
  const logger = makeStepLogger("flow_1_first_entry", runId);
  const state = makeState();
  await installRepeApiMocks(context, runId, state);
  await initializeRunContext(page, runId);
  await setBusinessContext(page, state.businessId);

  const consoleErrors = watchConsole(page);

  logger.log("navigate", "Go to REPE workspace", { route: "/app/finance/repe" });
  await page.goto("/app/finance/repe");
  await expect(page.getByRole("heading", { name: "Private Equity Waterfall Operations" })).toBeVisible();

  await page.getByTestId("fund-name").fill("Value-Add Multifamily Fund I (Test)");
  await page.getByTestId("fund-code").fill("VAMF1");
  await page.getByTestId("fund-strategy").fill("Value-Add");
  await page.getByTestId("create-fund").click();
  await expect(page.getByTestId(/fund-row-/).first()).toContainText("Value-Add Multifamily Fund I (Test)");

  const criticalConsole = consoleErrors.filter(
    (line) => !/Failed to fetch RSC payload|hot-reloader-client/i.test(line)
  );
  expect(new Set(state.funds.map((row) => row.fin_fund_id)).size).toBe(state.funds.length);
  expect(criticalConsole).toEqual([]);
});

test("Flow 2: Funds and capital ledger updates", async ({ context, page }) => {
  const runId = makeRunId();
  const logger = makeStepLogger("flow_2_funds", runId);
  const state = makeState();
  await installRepeApiMocks(context, runId, state);
  await initializeRunContext(page, runId);
  await setBusinessContext(page, state.businessId);

  await page.goto("/app/finance/repe");

  await page.getByTestId("fund-name").fill("Flow Two Fund");
  await page.getByTestId("fund-code").fill("FLOW2");
  await page.getByTestId("fund-strategy").fill("Core");
  await page.getByTestId("create-fund").click();

  await page.getByTestId("participant-name").fill("LP One");
  await page.getByTestId("participant-type").selectOption("lp");
  await page.getByTestId("create-participant").click();

  await page.getByTestId("commitment-participant").selectOption({ label: "LP One" });
  await page.getByTestId("create-commitment").click();

  await page.getByTestId("capital-call-date").fill("2028-02-01");
  await page.getByTestId("capital-call-amount").fill("1000000");
  await page.getByTestId("create-capital-call").click();
  await expect(page.getByTestId("capital-call-row").first()).toBeVisible();

  await page.getByTestId("asset-name").fill("Asset Flow 2");
  await page.getByTestId("asset-date").fill("2028-02-15");
  await page.getByTestId("asset-cost").fill("500000");
  await page.getByTestId("create-asset").click();
  await expect(page.getByTestId("asset-row").first()).toBeVisible();

  logger.log("assert", "Fund and ledger flow completed");
});

test("Flow 3: Deals pipeline page basic checks", async ({ context, page }) => {
  const runId = makeRunId();
  const state = makeState();
  await installRepeApiMocks(context, runId, state);
  await initializeRunContext(page, runId);
  await setBusinessContext(page, state.businessId);

  await page.goto("/app/finance/deals");
  await expect(page.getByText("Deals in Pipeline")).toBeVisible();
});

test("Flow 4: Asset management page loads", async ({ context, page }) => {
  const runId = makeRunId();
  const state = makeState();
  await installRepeApiMocks(context, runId, state);
  await initializeRunContext(page, runId);
  await setBusinessContext(page, state.businessId);

  await page.goto("/app/finance/asset-management");
  await expect(page.getByText("Assets marked watchlist/distress")).toBeVisible();
});

test("Flow 5: Underwriting models page loads", async ({ context, page }) => {
  const runId = makeRunId();
  const state = makeState();
  await installRepeApiMocks(context, runId, state);
  await initializeRunContext(page, runId);
  await setBusinessContext(page, state.businessId);

  await page.goto("/app/finance/underwriting");
  await expect(page).toHaveURL(/\/app\/finance\/underwriting/);
  await expect(page.getByText(/underwriting/i).first()).toBeVisible();
});

test("Flow 6: Waterfall run + idempotency + refresh", async ({ context, page }) => {
  const runId = makeRunId();
  const state = makeState();
  await installRepeApiMocks(context, runId, state);
  await initializeRunContext(page, runId);
  await setBusinessContext(page, state.businessId);

  await page.goto("/app/finance/repe");

  await page.getByTestId("fund-name").fill("Waterfall Fund");
  await page.getByTestId("fund-code").fill("WATER1");
  await page.getByTestId("fund-strategy").fill("Value-Add");
  await page.getByTestId("create-fund").click();

  await page.getByTestId("distribution-date").fill("2028-06-01");
  await page.getByTestId("distribution-amount").fill("1200000");
  await page.getByTestId("create-distribution").click();

  await page.getByTestId(/^run-waterfall-/).first().click();
  await expect(page.getByTestId("ledger-row").first()).toBeVisible();
  await page.getByTestId("run-determinism-check").click();
  await expect(page.getByTestId("run-id")).not.toHaveText("");
  await expect(page.getByTestId("repeat-run-id")).not.toHaveText("");

  await page.reload();
  await expect(page.getByTestId("ledger-total")).toContainText("Distribution:");
});

test("Flow 7: Documents page object filters available", async ({ context, page }) => {
  const runId = makeRunId();
  const state = makeState();
  await installRepeApiMocks(context, runId, state);
  await initializeRunContext(page, runId);
  await setBusinessContext(page, state.businessId);

  await page.goto("/documents");
  await expect(page.getByText(/documents/i).first()).toBeVisible();
});

test("Flow 8: Controls page loads with approvals context", async ({ context, page }) => {
  const runId = makeRunId();
  const state = makeState();
  await installRepeApiMocks(context, runId, state);
  await initializeRunContext(page, runId);
  await setBusinessContext(page, state.businessId);

  await page.goto("/app/finance/controls");
  await expect(page.getByText(/controls/i).first()).toBeVisible();

  expect(state.seenRunHeaders.every((header) => header === runId || header === "")).toBeTruthy();
});
