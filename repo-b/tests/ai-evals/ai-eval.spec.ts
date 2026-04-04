/**
 * Winston AI Evaluation Harness
 *
 * Tests real AI behavior against deterministic assertions.
 * Runs SERIALLY against a live backend — not mocked, not CI.
 *
 * Usage:
 *   cd repo-b && npm run test:ai-eval
 *
 * Output:
 *   artifacts/ai-evals/ai-eval-results.json
 *   artifacts/ai-evals/ai-eval-results.md
 *   artifacts/ai-evals/{case-id}-turn{n}.png
 */

import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  buildEvalClaims,
  installEvalSession,
  openWinstonCompanion,
  sendAndWaitForResponse,
} from "./helpers";
import type { EnvironmentSlug } from "../../src/lib/environmentAuth";
import rawCases from "./eval-cases.json";

// ── Types ────────────────────────────────────────────────────────────

type EvalPrompt = {
  user: string;
  allow_clarification?: boolean;
  require_contains_any?: string[];
  reject_contains_any?: string[];
};

type EvalCase = {
  id: string;
  description: string;
  env_slug: EnvironmentSlug;
  nav_path: string | null;
  prompts: EvalPrompt[];
};

type CheckResult = {
  kind: "require" | "reject";
  term: string;
  passed: boolean;
};

type TurnReceipt = {
  turn: number;
  prompt: string;
  response: string;
  checks: CheckResult[];
  passed: boolean;
  screenshot_path: string;
  error?: string;
};

type CaseResult = {
  id: string;
  description: string;
  env_slug: string;
  passed: boolean;
  turns: TurnReceipt[];
  error?: string;
};

// ── Setup ────────────────────────────────────────────────────────────

const cases = rawCases as EvalCase[];

const artifactsDir = path.resolve(__dirname, "../../..", "artifacts", "ai-evals");
fs.mkdirSync(artifactsDir, { recursive: true });

const allResults: CaseResult[] = [];

// ── Env ID discovery from real backend ─────────────────────────────────
// Maps slug → real env_id and slug → business_id, populated in beforeAll.
const envIdBySlug: Record<string, string> = {};
const bizIdBySlug: Record<string, string> = {};

const BACKEND_ORIGIN = process.env.BOS_API_ORIGIN || "http://localhost:8000";

// ── Test suite ───────────────────────────────────────────────────────

test.describe("Winston AI evals", () => {
  test.beforeAll(async () => {
    // Discover real environment IDs from the backend so we don't use fake IDs
    try {
      const resp = await fetch(`${BACKEND_ORIGIN}/v1/environments`);
      if (resp.ok) {
        const data = (await resp.json()) as {
          environments: { env_id: string; slug: string; business_id: string | null }[];
        };
        for (const env of data.environments) {
          if (env.slug) {
            envIdBySlug[env.slug] = env.env_id;
            if (env.business_id) bizIdBySlug[env.slug] = env.business_id;
          }
        }
        console.log(
          `Discovered ${Object.keys(envIdBySlug).length} environments:`,
          Object.entries(envIdBySlug)
            .map(([s, id]) => `${s}=${id.slice(0, 8)}…`)
            .join(", "),
        );
      }
    } catch (err) {
      console.warn("Could not discover environments from backend:", err);
    }
  });

  for (const evalCase of cases) {
    test(evalCase.id, async ({ page, context, baseURL }, testInfo) => {
      if (!baseURL) throw new Error("baseURL missing from playwright config");

      // Resolve env_id from discovered environments, with fallback to env var or fake ID
      const envId =
        envIdBySlug[evalCase.env_slug] ??
        process.env[`AI_EVAL_${evalCase.env_slug.toUpperCase()}_ENV_ID`] ??
        `env-${evalCase.env_slug}`;

      const caseResult: CaseResult = {
        id: evalCase.id,
        description: evalCase.description,
        env_slug: evalCase.env_slug,
        passed: true,
        turns: [],
      };

      try {
        // Install authenticated session with real env_ids in memberships
        const claims = buildEvalClaims(envId, evalCase.env_slug, envIdBySlug, bizIdBySlug);
        await installEvalSession(context, baseURL, claims);

        // Seed localStorage so the app shell knows which business/env we're in
        const bizId = bizIdBySlug[evalCase.env_slug] ?? "";
        await page.addInitScript(
          ([eid, bid]) => {
            localStorage.setItem("demo_lab_env_id", eid);
            if (bid) localStorage.setItem("bos_business_id", bid);
          },
          [envId, bizId],
        );

        // Navigate to the target page, replacing placeholder env IDs with real ones
        let navPath = evalCase.nav_path ?? `/lab/env/${envId}/`;
        // Replace any hardcoded "env-{slug}" in nav_path with the real env_id
        navPath = navPath.replace(/env-[a-z_-]+(?=\/)/, envId);
        await page.goto(navPath, { waitUntil: "domcontentloaded" });

        // Open Winston companion panel
        await openWinstonCompanion(page);

        // Execute each prompt in sequence
        for (let i = 0; i < evalCase.prompts.length; i++) {
          const prompt = evalCase.prompts[i];
          const turnNum = i + 1;
          const screenshotName = `${evalCase.id}-turn${turnNum}.png`;
          const screenshotPath = path.join(artifactsDir, screenshotName);

          let responseText = "";
          let turnError: string | undefined;

          try {
            responseText = await sendAndWaitForResponse(page, prompt.user);
          } catch (err) {
            turnError = String(err);
          }

          // Screenshot after each turn
          await page.screenshot({ path: screenshotPath, fullPage: false });

          // Evaluate checks
          const checks: CheckResult[] = [];
          let turnPassed = !turnError;

          if (!turnError && prompt.require_contains_any?.length) {
            const hit = prompt.require_contains_any.some((term) =>
              responseText.toLowerCase().includes(term.toLowerCase()),
            );
            checks.push({
              kind: "require",
              term: prompt.require_contains_any.join(" | "),
              passed: hit,
            });
            if (!hit) turnPassed = false;
          }

          if (!turnError && prompt.reject_contains_any?.length) {
            for (const term of prompt.reject_contains_any) {
              const found = responseText.toLowerCase().includes(term.toLowerCase());
              checks.push({ kind: "reject", term, passed: !found });
              if (found) turnPassed = false;
            }
          }

          if (!turnPassed) caseResult.passed = false;

          const turnReceipt: TurnReceipt = {
            turn: turnNum,
            prompt: prompt.user,
            response: responseText.slice(0, 3000),
            checks,
            passed: turnPassed,
            screenshot_path: screenshotPath,
          };
          if (turnError) turnReceipt.error = turnError;

          caseResult.turns.push(turnReceipt);

          // Add annotations to Playwright report for failed checks
          if (!turnPassed) {
            for (const check of checks) {
              if (!check.passed) {
                testInfo.annotations.push({
                  type: `check-failure-turn${turnNum}`,
                  description: `[${check.kind}] "${check.term}" — response: ${responseText.slice(0, 200)}`,
                });
              }
            }
            if (turnError) {
              testInfo.annotations.push({
                type: `error-turn${turnNum}`,
                description: turnError,
              });
            }
          }
        }
      } catch (err) {
        caseResult.passed = false;
        caseResult.error = String(err);
        testInfo.annotations.push({
          type: "case-error",
          description: String(err),
        });
      }

      allResults.push(caseResult);

      // Hard assert at the end — makes test red/green in Playwright HTML report
      expect(
        caseResult.passed,
        `Case "${evalCase.id}" failed — see annotations and ${artifactsDir}`,
      ).toBe(true);
    });
  }

  // ── Results output ──────────────────────────────────────────────────

  test.afterAll(async () => {
    writeResultFiles(allResults, artifactsDir);
  });
});

// ── Result file writers ───────────────────────────────────────────────

function writeResultFiles(results: CaseResult[], outDir: string): void {
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const timestamp = new Date().toISOString();

  // JSON receipt
  const jsonPath = path.join(outDir, "ai-eval-results.json");
  fs.writeFileSync(jsonPath, JSON.stringify({ timestamp, passed, total, results }, null, 2), "utf8");

  // Markdown summary
  const lines: string[] = [
    `# Winston AI Eval Results`,
    ``,
    `**${passed}/${total} cases passed** · ${timestamp}`,
    ``,
    `| # | Case | Description | Env | Result |`,
    `|---|------|-------------|-----|--------|`,
    ...results.map((r, i) =>
      `| ${i + 1} | \`${r.id}\` | ${r.description} | ${r.env_slug} | ${r.passed ? "✅ PASS" : "❌ FAIL"} |`,
    ),
    ``,
  ];

  for (const r of results) {
    lines.push(`## ${r.id} — ${r.passed ? "PASS" : "FAIL"}`);
    lines.push(`> ${r.description}`);
    lines.push(``);
    if (r.error) {
      lines.push(`**Case error:** \`${r.error}\``);
      lines.push(``);
    }
    for (const t of r.turns) {
      lines.push(`### Turn ${t.turn}`);
      lines.push(`**Prompt:** "${t.prompt}"`);
      lines.push(``);
      if (t.error) {
        lines.push(`**Error:** \`${t.error}\``);
      } else {
        lines.push(`**Response (truncated):**`);
        lines.push(`> ${t.response.slice(0, 500).replace(/\n/g, " ")}`);
      }
      lines.push(``);
      if (t.checks.length > 0) {
        lines.push(`**Checks:**`);
        for (const c of t.checks) {
          lines.push(`- ${c.passed ? "✅" : "❌"} [${c.kind}] \`${c.term}\``);
        }
      }
      lines.push(`**Screenshot:** \`${t.screenshot_path}\``);
      lines.push(``);
    }
    lines.push(`---`);
    lines.push(``);
  }

  const mdPath = path.join(outDir, "ai-eval-results.md");
  fs.writeFileSync(mdPath, lines.join("\n"), "utf8");

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`AI Eval Results: ${passed}/${total} passed`);
  console.log(`JSON:     ${jsonPath}`);
  console.log(`Markdown: ${mdPath}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}
