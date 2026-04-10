#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const requireFromRepoB = createRequire(
  new URL("../../repo-b/package.json", import.meta.url),
);
const { chromium } = requireFromRepoB("playwright");

const outputPath = process.argv[2];
const rawConfig = process.argv[3];

if (!outputPath || !rawConfig) {
  console.error("Usage: meridian_surface_probe.mjs <output-path> <json-config>");
  process.exit(1);
}

const config = JSON.parse(rawConfig);
const baseUrl = config.base_url;
const envId = config.env_id;
const fundId = config.fund_id;
const investmentId = config.investment_id;
const assetId = config.asset_id;
const requestedQuarter = config.requested_quarter;
const stoneEnvId = config.stone_env_id;
const stoneProjectId = config.stone_project_id;
// Authoritative State Lockdown — Phase 2 verification session.
// Cookie name + value are minted by sign_verification_session.mjs and
// passed in via the config JSON. See docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md.
const platformSessionCookieName = config.platform_session_cookie_name || null;
const platformSessionCookieValue = config.platform_session_cookie_value || null;

function normalizeWhitespace(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function extractMetricValue(blockText, label) {
  if (!blockText) return null;
  const lines = blockText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const labelIndex = lines.findIndex(
    (line) => line.toLowerCase() === String(label).toLowerCase(),
  );
  if (labelIndex === -1) return null;
  return lines[labelIndex + 1] || null;
}

function extractQuarterTokens(urls) {
  const quarters = new Set();
  for (const url of urls) {
    const quarterMatch = url.match(/([12]\d{3}Q[1-4])/g);
    if (quarterMatch) {
      for (const quarter of quarterMatch) quarters.add(quarter);
    }
    try {
      const parsed = new URL(url);
      const explicit = parsed.searchParams.get("quarter");
      if (explicit) quarters.add(explicit);
    } catch {
      // Ignore malformed URLs captured from console output.
    }
  }
  return Array.from(quarters).sort();
}

async function maybeClick(locator, timeout = 2_500) {
  await locator.click({ timeout }).catch(() => null);
}

async function maybeSelect(locator, value, timeout = 2_500) {
  await locator.selectOption(value, { timeout }).catch(() => null);
}

async function collectPageState(context, options) {
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const relevantResponses = [];
  let navResponse = null;
  let navigationError = null;

  page.on("pageerror", (err) => {
    pageErrors.push(String(err?.message || err));
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("response", (response) => {
    const url = response.url();
    if (
      url.includes("/api/re/") ||
      url.includes("/bos/api/re/") ||
      url.includes("/api/pds") ||
      url.includes("/bos/api/pds")
    ) {
      relevantResponses.push({
        url,
        status: response.status(),
        ok: response.ok(),
      });
    }
  });

  try {
    navResponse = await page.goto(options.url, {
      waitUntil: "domcontentloaded",
      timeout: options.navigationTimeoutMs ?? 15_000,
    });
  } catch (error) {
    navigationError = String(error?.message || error);
    pageErrors.push(`navigation_error: ${navigationError}`);
  }
  const status = navResponse?.status() ?? null;
  const initialBodyText = normalizeWhitespace(
    await page.locator("body").innerText().catch(() => ""),
  );
  const authBlocked =
    /forbidden|unauthorized|sign in|login|access denied/i.test(initialBodyText) ||
    /unauthorized|login/i.test(page.url());
  const pageBlocked = (status !== null && status >= 400) || authBlocked;
  if (options.waitForSelector && !pageBlocked) {
    await page.locator(options.waitForSelector).waitFor({ timeout: 5_000 }).catch(() => null);
  }
  if (options.afterLoad && !pageBlocked) {
    await options.afterLoad(page);
  }
  await page.waitForTimeout(options.settleMs ?? 2_000);

  const bodyText = normalizeWhitespace(await page.locator("body").innerText().catch(() => ""));
  const result = {
    label: options.label,
    url: options.url,
    final_url: page.url(),
    status,
    page_blocked: pageBlocked,
    navigation_error: navigationError,
    body_text_excerpt: bodyText.slice(0, 1200),
    page_errors: pageErrors,
    console_errors: consoleErrors,
    responses: relevantResponses,
    observed_quarters: extractQuarterTokens(relevantResponses.map((item) => item.url)),
  };
  if (options.collect) {
    Object.assign(result, await options.collect(page, bodyText));
  }
  await page.close();
  return result;
}

async function collectIsolatedPageState(options) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const cookieUrl = new URL(baseUrl);
  // Authoritative State Lockdown — Phase 2
  // Inject the real signed bm_session cookie when one is provided.
  // The legacy demo_lab_session cookie is kept only as a no-op fallback
  // so existing audit logs still mention it.
  const cookies = [
    {
      name: "demo_lab_session",
      value: "active",
      domain: cookieUrl.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: cookieUrl.protocol === "https:",
    },
  ];
  if (platformSessionCookieName && platformSessionCookieValue) {
    cookies.push({
      name: platformSessionCookieName,
      value: platformSessionCookieValue,
      domain: cookieUrl.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: cookieUrl.protocol === "https:",
    });
  } else {
    console.error(
      "[surface_probe] no platform_session_cookie_value supplied; auth-protected URLs will return 4xx",
    );
  }
  await context.addCookies(cookies);
  try {
    return await collectPageState(context, options);
  } catch (error) {
    return {
      label: options.label,
      url: options.url,
      final_url: null,
      status: null,
      page_blocked: false,
      navigation_error: String(error?.message || error),
      body_text_excerpt: "",
      page_errors: [String(error?.message || error)],
      console_errors: [],
      responses: [],
      observed_quarters: [],
    };
  } finally {
    await browser.close().catch(() => null);
  }
}

function summarizeStonePage(pageResult) {
  const errorText = `${pageResult.body_text_excerpt}\n${pageResult.page_errors.join("\n")}\n${pageResult.console_errors.join("\n")}`;
  const datetimeCrash =
    /offset-naive|offset-aware|can't compare|cannot compare|datetime/i.test(errorText);
  const hardFailure =
    /workspace error|internal server error|application error|something went wrong/i.test(errorText);
  return {
    ...pageResult,
    datetime_crash_detected: datetimeCrash,
    hard_failure_detected: hardFailure,
  };
}

async function main() {
  const fundPage = await collectIsolatedPageState({
    label: "fund_page",
    url: `${baseUrl}/lab/env/${envId}/re/funds/${fundId}?quarter=${requestedQuarter}`,
    waitForSelector: "[data-testid='re-fund-detail']",
    settleMs: 3_000,
    afterLoad: async (page) => {
      const returnsTab = page.locator("[data-testid='tab-performance']");
      await maybeClick(returnsTab);
      await page.waitForTimeout(2_000);
    },
    collect: async (page) => {
      const returnsText = await page
        .locator("[data-testid='returns-kpis']")
        .innerText()
        .catch(() => null);
      return {
        requested_quarter: requestedQuarter,
        returns_kpis_text: returnsText,
        fund_visible: await page.locator("[data-testid='re-fund-detail']").isVisible().catch(() => false),
        metric_values: {
          tvpi: extractMetricValue(returnsText, "TVPI"),
          gross_irr: extractMetricValue(returnsText, "Gross IRR"),
          net_irr: extractMetricValue(returnsText, "Net IRR"),
          net_tvpi: extractMetricValue(returnsText, "Net TVPI"),
          // Authoritative State Lockdown — Phase 4 follow-up tiles
          gross_operating_cash_flow: extractMetricValue(returnsText, "Gross Op Cash Flow"),
          asset_count: extractMetricValue(returnsText, "Asset Count"),
        },
      };
    },
  });

  const investmentPage = await collectIsolatedPageState({
    label: "investment_page",
    url: `${baseUrl}/lab/env/${envId}/re/investments/${investmentId}?quarter=${requestedQuarter}`,
    waitForSelector: "[data-testid='investment-briefing-page']",
    settleMs: 3_000,
    collect: async (page) => {
      const headerText = await page.locator("header").innerText().catch(() => null);
      const metricBlocks = {};
      for (const testId of [
        "hero-metric-gross-irr",
        "outcome-metric-nav",
        "outcome-metric-gross-irr",
        "operating-metric-noi",
        "operating-metric-revenue",
      ]) {
        metricBlocks[testId] = await page.locator(`[data-testid='${testId}']`).innerText().catch(() => null);
      }
      return {
        requested_quarter: requestedQuarter,
        header_text: headerText,
        metric_blocks: metricBlocks,
        extracted_values: {
          hero_gross_irr: extractMetricValue(metricBlocks["hero-metric-gross-irr"], "Gross IRR"),
          nav: extractMetricValue(metricBlocks["outcome-metric-nav"], "NAV"),
          outcome_gross_irr: extractMetricValue(metricBlocks["outcome-metric-gross-irr"], "Gross IRR"),
          noi: extractMetricValue(metricBlocks["operating-metric-noi"], "NOI"),
          revenue: extractMetricValue(metricBlocks["operating-metric-revenue"], "Revenue"),
        },
      };
    },
  });

  const assetPage = await collectIsolatedPageState({
    label: "asset_page",
    url: `${baseUrl}/lab/env/${envId}/re/assets/${assetId}`,
    waitForSelector: "[data-testid='re-asset-homepage']",
    settleMs: 3_000,
    afterLoad: async (page) => {
      await maybeClick(page.getByRole("button", { name: "Financials" }));
      await page.locator("[data-testid='asset-financials-section']").waitFor({ timeout: 20_000 }).catch(() => null);
      const financials = page.locator("[data-testid='asset-financials-section']");
      const periodSelect = financials.locator("select").first();
      await maybeSelect(periodSelect, requestedQuarter);
      await page.waitForTimeout(1_500);
      const accountingToggle = financials.getByRole("button", { name: new RegExp(`Accounting .* ${requestedQuarter}|Accounting`, "i") });
      await maybeClick(accountingToggle);
      await page.waitForTimeout(1_500);
    },
    collect: async (page) => {
      const financials = page.locator("[data-testid='asset-financials-section']");
      const selectedQuarter = await financials.locator("select").inputValue().catch(() => null);
      const historyRows = await financials
        .locator("table")
        .nth(0)
        .locator("tbody tr")
        .evaluateAll((rows) =>
          rows.map((row) =>
            Array.from(row.querySelectorAll("td"))
              .map((cell) => cell.textContent?.trim() || "")
              .filter(Boolean),
          ),
        )
        .catch(() => []);
      const matchingHistory = historyRows.find((row) => row[0] === requestedQuarter) || null;

      const pnlRows = await financials
        .locator("table")
        .nth(2)
        .locator("tbody tr")
        .evaluateAll((rows) =>
          rows.map((row) => {
            const cells = Array.from(row.querySelectorAll("td")).map((cell) => cell.textContent?.trim() || "");
            return { line_code: cells[0] || null, amount: cells[1] || null };
          }),
        )
        .catch(() => []);

      return {
        requested_quarter: requestedQuarter,
        selected_quarter: selectedQuarter,
        history_row: matchingHistory,
        pnl_rows: pnlRows,
      };
    },
  });

  const stoneRoutes = [
    {
      label: "stone_command_center",
      url: `${baseUrl}/lab/env/${stoneEnvId}/pds`,
      selector: "body",
    },
    {
      label: "stone_pipeline",
      url: `${baseUrl}/lab/env/${stoneEnvId}/pds/pipeline`,
      selector: "body",
    },
    {
      label: "stone_forecast",
      url: `${baseUrl}/lab/env/${stoneEnvId}/pds/forecast`,
      selector: "body",
    },
    {
      label: "stone_project_detail",
      url: `${baseUrl}/lab/env/${stoneEnvId}/pds/projects/${stoneProjectId}`,
      selector: "body",
    },
  ];

  const stonePages = [];
  for (const route of stoneRoutes) {
    const pageResult = await collectIsolatedPageState({
      label: route.label,
      url: route.url,
      waitForSelector: route.selector,
      settleMs: 3_000,
    });
    stonePages.push(summarizeStonePage(pageResult));
  }

  const payload = {
    generated_at: new Date().toISOString(),
    base_url: baseUrl,
    requested_quarter: requestedQuarter,
    fund_page: fundPage,
    investment_page: investmentPage,
    asset_page: assetPage,
    stone_pages: stonePages,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2));
}

main().catch(async (error) => {
  const failure = {
    generated_at: new Date().toISOString(),
    error: String(error?.stack || error),
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(failure, null, 2));
  process.exit(1);
});
