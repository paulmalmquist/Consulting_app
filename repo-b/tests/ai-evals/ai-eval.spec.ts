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

// ── Test suite ───────────────────────────────────────────────────────

test.describe.serial("Winston AI evals", () => {
  for (const evalCase of cases) {
    test(evalCase.id, async ({ page, context, baseURL }, testInfo) => {
      if (!baseURL) throw new Error("baseURL missing from playwright config");

      // Resolve env_id: static envs use "env-{slug}", meridian uses a real DB env_id
      // For local dev, meridian is typically a real env created in the demo lab.
      // Fall back to "env-meridian" if no real env is available.
      const envId =
        evalCase.env_slug === "meridian"
          ? process.env.AI_EVAL_MERIDIAN_ENV_ID ?? "env-meridian"
          : `env-${evalCase.env_slug}`;

      const caseResult: CaseResult = {
        id: evalCase.id,
        description: evalCase.description,
        env_slug: evalCase.env_slug,
        passed: true,
        turns: [],
      };

      try {
        // Install authenticated session
        const claims = buildEvalClaims(envId, evalCase.env_slug);
        await installEvalSession(context, baseURL, claims);

        // Navigate to the target page
        const navPath = evalCase.nav_path ?? `/lab/env/${envId}/`;
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
