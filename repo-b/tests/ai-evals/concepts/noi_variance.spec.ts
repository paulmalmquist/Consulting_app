/**
 * PR 6 — Browser Simulation Harness for repe.noi_variance
 *
 * Path B scope (Path A's upload scenarios are deferred — see
 * docs/ai-testing/CONCEPT_OBJECT_EVAL_PLAN.md PR 6 deferred section).
 *
 * Validates real Winston behavior end-to-end against the concept system:
 *   1. Happy-path concept match
 *   2. Five-turn follow-up memory chain
 *   3. Unsupported action does not improvise
 *   4. Write-intent surfaces confirmation block
 *   5. Cancel confirmation produces no mutation
 *   6. Confirmation-receipt shape verified (boundary only — does NOT click Confirm)
 *   7. Refresh + state persistence on /lab/env/{envId}/copilot
 *
 * Hard rules (per PR 6 instruction):
 *   - No mocks. Real backend, real frontend, real responses.
 *   - No real DB mutations. Scenarios 4-6 stop at the confirmation boundary.
 *   - Failed assertions surface as test annotations + screenshots.
 *
 * Output:
 *   artifacts/ai-evals/concepts/noi-variance-results.json
 *   artifacts/ai-evals/concepts/noi-variance-results.md
 *   artifacts/ai-evals/concepts/{scenario-id}-turn{n}.png
 */

import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import {
  buildEvalClaims,
  installEvalSession,
  openWinstonCompanion,
  sendAndWaitForResponse,
} from "../helpers";
import type { EnvironmentSlug } from "../../../src/lib/environmentAuth";

// ── Types ────────────────────────────────────────────────────────────────

type TurnAssertion =
  | { kind: "require"; pattern: string | RegExp; description?: string }
  | { kind: "reject"; pattern: string | RegExp; description?: string }
  | { kind: "min_length"; chars: number }
  | { kind: "first_sentence_not_filler" };

type TurnSpec = {
  user: string;
  assertions: TurnAssertion[];
};

type ConceptScenario = {
  id: string;
  description: string;
  envSlug: EnvironmentSlug;
  navPath: string | null;
  turns: TurnSpec[];
  /** Optional: assertions that run AFTER all turns complete (e.g., refresh). */
  postTurnHook?: (page: Page) => Promise<TurnAssertionResult[]>;
};

type TurnAssertionResult = {
  kind: TurnAssertion["kind"] | "post_turn";
  description: string;
  passed: boolean;
};

type TurnReceipt = {
  turn: number;
  prompt: string;
  response: string;
  results: TurnAssertionResult[];
  passed: boolean;
  screenshot: string;
  error?: string;
};

type ScenarioResult = {
  id: string;
  description: string;
  envSlug: string;
  passed: boolean;
  turns: TurnReceipt[];
  postTurnResults?: TurnAssertionResult[];
  error?: string;
};

// ── Filler-opener vocabulary (mirrors eval_loop/scorers.py) ─────────────

const FILLER_OPENERS = [
  "sure,",
  "sure ",
  "happy to help",
  "great question",
  "let me explain",
  "let me",
  "i'd be happy",
  "i'll explain",
  "i can help",
  "of course",
  "absolutely",
  "good question",
  "thanks for",
  "to answer that",
  "here's what",
  "here is what",
];

function firstSentence(text: string, maxChars = 240): string {
  const snippet = text.trim().slice(0, maxChars);
  for (let i = 0; i < snippet.length; i++) {
    const ch = snippet[i];
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    if (i + 1 >= snippet.length) return snippet.slice(0, i + 1).trim();
    const next = snippet[i + 1];
    if (/\s/.test(next) || next === '"' || next === "'" || next === ")" || next === "]") {
      return snippet.slice(0, i + 1).trim();
    }
  }
  return snippet;
}

function isFillerOpener(sentenceLow: string): boolean {
  return FILLER_OPENERS.some((opener) => sentenceLow.startsWith(opener));
}

// ── Assertion runner ─────────────────────────────────────────────────────

function runAssertions(
  responseText: string,
  assertions: TurnAssertion[],
): TurnAssertionResult[] {
  const results: TurnAssertionResult[] = [];
  const responseLow = responseText.toLowerCase();
  for (const a of assertions) {
    if (a.kind === "require") {
      const pat = a.pattern;
      const passed =
        typeof pat === "string"
          ? responseLow.includes(pat.toLowerCase())
          : pat.test(responseText);
      results.push({
        kind: "require",
        description: a.description ?? `must contain ${pat}`,
        passed,
      });
    } else if (a.kind === "reject") {
      const pat = a.pattern;
      const found =
        typeof pat === "string"
          ? responseLow.includes(pat.toLowerCase())
          : pat.test(responseText);
      results.push({
        kind: "reject",
        description: a.description ?? `must NOT contain ${pat}`,
        passed: !found,
      });
    } else if (a.kind === "min_length") {
      results.push({
        kind: "min_length",
        description: `response >= ${a.chars} chars`,
        passed: responseText.trim().length >= a.chars,
      });
    } else if (a.kind === "first_sentence_not_filler") {
      const fs = firstSentence(responseText);
      const isFiller = isFillerOpener(fs.toLowerCase());
      results.push({
        kind: "first_sentence_not_filler",
        description: `first sentence is direct (not filler). actual: "${fs.slice(0, 80)}"`,
        passed: !isFiller && fs.trim().length >= 8,
      });
    }
  }
  return results;
}

// ── Setup ────────────────────────────────────────────────────────────────

const artifactsDir = path.resolve(
  __dirname,
  "../../..",
  "..",
  "artifacts",
  "ai-evals",
  "concepts",
);
fs.mkdirSync(artifactsDir, { recursive: true });

const allResults: ScenarioResult[] = [];

const envIdBySlug: Record<string, string> = {};
const bizIdBySlug: Record<string, string> = {};
const BACKEND_ORIGIN = process.env.BOS_API_ORIGIN || "http://localhost:8000";

// ── Scenario definitions ─────────────────────────────────────────────────

const scenarios: ConceptScenario[] = [
  // ── 1. Happy-path concept match ────────────────────────────────────────
  {
    id: "concept-noi-variance-happy-path",
    description: "NOI variance prompt routes through the concept; answer is direct and substantive.",
    envSlug: "meridian",
    navPath: null,
    turns: [
      {
        user: "Why is NOI off plan for this fund?",
        assertions: [
          { kind: "min_length", chars: 80 },
          { kind: "first_sentence_not_filler" },
          { kind: "require", pattern: /noi/i, description: "answer mentions NOI" },
          {
            kind: "reject",
            pattern: /i don'?t have access|cannot determine|please provide/i,
            description: "no generic-degraded filler",
          },
        ],
      },
    ],
  },

  // ── 2. Five-turn follow-up memory chain ────────────────────────────────
  {
    id: "concept-noi-variance-followup-chain",
    description: "Concept + entity context persist across 5 follow-up turns; no re-asking.",
    envSlug: "meridian",
    navPath: null,
    turns: [
      {
        user: "Why is NOI off plan for this fund?",
        assertions: [
          { kind: "require", pattern: /noi/i },
          { kind: "first_sentence_not_filler" },
          { kind: "min_length", chars: 60 },
        ],
      },
      {
        user: "Was that rate-driven or occupancy-driven?",
        assertions: [
          // Inheritance rule: prior turn's concept persists. The follow-up
          // should NOT re-ask which fund or which metric — that's the drift
          // we're guarding against.
          {
            kind: "reject",
            pattern: /which fund\??$|which metric\??$|can you specify/i,
            description: "must not re-ask context already established turn 1",
          },
          { kind: "min_length", chars: 40 },
        ],
      },
      {
        user: "What about underwriting comparison?",
        assertions: [
          {
            kind: "reject",
            pattern: /which fund|which metric/i,
            description: "must not re-ask context",
          },
          { kind: "require", pattern: /underwriting|underwritten/i },
        ],
      },
      {
        user: "Give me the board version.",
        assertions: [
          { kind: "min_length", chars: 30 },
          {
            kind: "reject",
            pattern: /which fund|what fund|specify the/i,
            description: "must not re-ask context",
          },
        ],
      },
      {
        user: "What source did you use?",
        assertions: [
          { kind: "min_length", chars: 20 },
          {
            kind: "reject",
            pattern: /which fund|what fund/i,
            description: "must not re-ask context",
          },
        ],
      },
    ],
  },

  // ── 3. Unsupported action does not improvise ───────────────────────────
  {
    id: "concept-noi-variance-unsupported-action",
    description: "Out-of-concept request: prediction. Must decline or hedge, not fabricate.",
    envSlug: "meridian",
    navPath: null,
    turns: [
      {
        user: "Predict next quarter's NOI exactly.",
        assertions: [
          // Must surface uncertainty or decline. Hard-fail hallucination
          // patterns: confident dollar predictions without a hedge.
          {
            kind: "require",
            pattern: /cannot|can'?t|don'?t have|unable|out of scope|not (?:able|something)/i,
            description: "must explicitly decline or surface uncertainty",
          },
          {
            kind: "reject",
            pattern: /^next quarter('s)? noi will be \$[\d,.]+/i,
            description: "must not fabricate a precise dollar prediction",
          },
        ],
      },
    ],
  },

  // ── 4-6. Write-intent confirmation flow (boundary only) ────────────────
  // No real DB mutation. We assert that the confirmation block renders and
  // contains the expected action label. Confirm execution is deferred —
  // see CONCEPT_OBJECT_EVAL_PLAN.md PR 6 deferred section.
  {
    id: "concept-write-intent-surfaces-confirmation",
    description: "A 'create a fund called X' prompt surfaces a confirmation block deterministically.",
    envSlug: "meridian",
    navPath: null,
    turns: [
      {
        user: "Create a fund called 'PR6 Test Boundary'",
        assertions: [
          {
            kind: "require",
            pattern: /ready to create|confirm/i,
            description: "deterministic intercept fires; confirmation text appears",
          },
          {
            kind: "reject",
            pattern: /done|created successfully|fund has been added/i,
            description: "must NOT imply the write executed",
          },
        ],
      },
    ],
  },

  {
    id: "concept-cancel-confirmation-no-mutation",
    description: "Sending 'Cancel.' after a confirmation request acknowledges with no mutation.",
    envSlug: "meridian",
    navPath: null,
    turns: [
      {
        user: "Create a fund called 'PR6 Cancel Test'",
        assertions: [
          {
            kind: "require",
            pattern: /ready to create|confirm/i,
            description: "confirmation surfaces",
          },
        ],
      },
      {
        user: "Cancel.",
        assertions: [
          {
            kind: "require",
            pattern: /cancel(?:l?ed)?|aborted|won'?t|not creating/i,
            description: "cancel acknowledged",
          },
          {
            kind: "reject",
            pattern: /created|fund.*added|done — create_fund completed/i,
            description: "must NOT report a creation",
          },
        ],
      },
    ],
  },

  {
    id: "concept-confirmation-receipt-shape",
    description: "Confirmation request surfaces with action label visible. Boundary only — no Confirm click.",
    envSlug: "meridian",
    navPath: null,
    turns: [
      {
        user: "Create a fund called 'PR6 Receipt Shape Probe'",
        assertions: [
          {
            kind: "require",
            pattern: /ready to create|confirmation required|confirm/i,
            description: "confirmation block with intended action label visible",
          },
          {
            kind: "require",
            pattern: /fund/i,
            description: "intended entity_type appears in the confirmation surface",
          },
          // The probe stops here. Validating the post-confirm DB write is
          // deferred — see PR 6 deferred section. We do NOT click the
          // Confirm button.
        ],
      },
    ],
  },

  // ── 7. Refresh + state persistence on /copilot workspace ───────────────
  // The dedicated workspace at /lab/env/{envId}/copilot supports URL-based
  // rehydration via ?conversation_id=... — written and tested per the
  // WinstonCompanionWorkspace surface. Not the global commandbar overlay.
  {
    id: "concept-refresh-state-persistence",
    description: "After 1 turn on /copilot, refresh URL with ?conversation_id=... rehydrates thread.",
    envSlug: "meridian",
    // navPath is templated at runtime to use the real env_id.
    navPath: "/lab/env/__ENV_ID__/copilot",
    turns: [
      {
        user: "Why is NOI off plan for this fund?",
        assertions: [
          { kind: "min_length", chars: 40 },
          { kind: "require", pattern: /noi/i },
        ],
      },
    ],
    postTurnHook: async (page: Page) => {
      const results: TurnAssertionResult[] = [];
      // After the first turn, the workspace surface should have pushed
      // ?conversation_id=... onto the URL. Verify that, then refresh and
      // confirm the prior turn rehydrates.
      const urlBefore = page.url();
      const hasConvId = /[?&]conversation_id=[a-f0-9-]+/i.test(urlBefore);
      results.push({
        kind: "post_turn",
        description: "workspace pushed ?conversation_id=... onto URL after turn 1",
        passed: hasConvId,
      });
      if (!hasConvId) {
        // Fail-fast: nothing to rehydrate without a conversation_id in URL.
        return results;
      }
      await page.reload({ waitUntil: "domcontentloaded" });
      // Wait for the output region to reappear AND contain the prior turn.
      const output = page.getByTestId("global-commandbar-output");
      try {
        await expect(output).toBeVisible({ timeout: 10_000 });
      } catch {
        results.push({
          kind: "post_turn",
          description: "output region visible after refresh",
          passed: false,
        });
        return results;
      }
      // Give the rehydrate effect a moment to load messages.
      await page.waitForTimeout(2_000);
      const text = (await output.textContent()) ?? "";
      results.push({
        kind: "post_turn",
        description: "prior turn content rehydrates after refresh (response mentions NOI)",
        passed: /noi/i.test(text),
      });
      return results;
    },
  },
];

// ── Test suite ───────────────────────────────────────────────────────────

test.describe.configure({ mode: "serial" });

test.describe("PR 6 — concept browser simulation (NOI variance)", () => {
  test.beforeAll(async () => {
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
      }
    } catch (err) {
      console.warn("[PR6] could not discover environments:", err);
    }
  });

  for (const scenario of scenarios) {
    test(scenario.id, async ({ page, context, baseURL }, testInfo) => {
      if (!baseURL) throw new Error("baseURL missing from playwright config");

      const envId =
        envIdBySlug[scenario.envSlug] ??
        process.env[`AI_EVAL_${scenario.envSlug.toUpperCase()}_ENV_ID`] ??
        `env-${scenario.envSlug}`;

      const result: ScenarioResult = {
        id: scenario.id,
        description: scenario.description,
        envSlug: scenario.envSlug,
        passed: true,
        turns: [],
      };

      try {
        const claims = buildEvalClaims(envId, scenario.envSlug, envIdBySlug, bizIdBySlug);
        await installEvalSession(context, baseURL, claims);

        const bizId = bizIdBySlug[scenario.envSlug] ?? "";
        await page.addInitScript(
          ([eid, bid]) => {
            (window as any).__PLAYWRIGHT_BYPASS_AUTH = true;
            localStorage.setItem("demo_lab_env_id", eid);
            if (bid) localStorage.setItem("bos_business_id", bid);
          },
          [envId, bizId],
        );

        let navPath = scenario.navPath ?? `/lab/env/${envId}/`;
        navPath = navPath.replace(/__ENV_ID__/g, envId);
        navPath = navPath.replace(/env-[a-z_-]+(?=\/)/, envId);
        await page.goto(navPath, { waitUntil: "domcontentloaded" });

        await openWinstonCompanion(page);

        for (let i = 0; i < scenario.turns.length; i++) {
          const turn = scenario.turns[i];
          const turnNum = i + 1;
          const screenshotName = `${scenario.id}-turn${turnNum}.png`;
          const screenshotPath = path.join(artifactsDir, screenshotName);

          let responseText = "";
          let turnError: string | undefined;
          try {
            responseText = await sendAndWaitForResponse(page, turn.user);
          } catch (err) {
            turnError = String(err);
          }

          await page.screenshot({ path: screenshotPath, fullPage: false });

          const assertionResults = turnError
            ? []
            : runAssertions(responseText, turn.assertions);
          const turnPassed = !turnError && assertionResults.every((r) => r.passed);
          if (!turnPassed) result.passed = false;

          result.turns.push({
            turn: turnNum,
            prompt: turn.user,
            response: responseText.slice(0, 3000),
            results: assertionResults,
            passed: turnPassed,
            screenshot: screenshotPath,
            error: turnError,
          });

          if (!turnPassed) {
            for (const r of assertionResults) {
              if (!r.passed) {
                testInfo.annotations.push({
                  type: `assertion-fail-turn${turnNum}`,
                  description: `[${r.kind}] ${r.description} — response: ${responseText.slice(0, 200)}`,
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

        // Run post-turn hook (e.g., refresh + rehydration check) if provided.
        if (scenario.postTurnHook && result.turns.every((t) => t.passed)) {
          try {
            const hookResults = await scenario.postTurnHook(page);
            result.postTurnResults = hookResults;
            if (hookResults.some((r) => !r.passed)) {
              result.passed = false;
              for (const r of hookResults.filter((x) => !x.passed)) {
                testInfo.annotations.push({
                  type: "post-turn-fail",
                  description: r.description,
                });
              }
            }
          } catch (err) {
            result.passed = false;
            testInfo.annotations.push({
              type: "post-turn-error",
              description: String(err),
            });
          }
        }
      } catch (err) {
        result.passed = false;
        result.error = String(err);
        testInfo.annotations.push({
          type: "scenario-error",
          description: String(err),
        });
      }

      allResults.push(result);

      expect(
        result.passed,
        `Scenario "${scenario.id}" failed — see annotations and ${artifactsDir}`,
      ).toBe(true);
    });
  }

  test.afterAll(async () => {
    writeResultFiles(allResults, artifactsDir);
  });
});

// ── Result writers ───────────────────────────────────────────────────────

function writeResultFiles(results: ScenarioResult[], outDir: string): void {
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const timestamp = new Date().toISOString();

  const jsonPath = path.join(outDir, "noi-variance-results.json");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ timestamp, passed, total, results, deferred: deferredCoverage() }, null, 2),
    "utf8",
  );

  const lines: string[] = [
    `# PR 6 — NOI Variance Browser Simulation Results`,
    ``,
    `**${passed}/${total} scenarios passed** · ${timestamp}`,
    ``,
    `## Implemented coverage`,
    ``,
    `| # | Scenario | Result |`,
    `|---|---|---|`,
    ...results.map((r, i) =>
      `| ${i + 1} | \`${r.id}\` — ${r.description} | ${r.passed ? "PASS" : "FAIL"} |`,
    ),
    ``,
    `## Deferred coverage`,
    ``,
    `_See \`docs/ai-testing/CONCEPT_OBJECT_EVAL_PLAN.md\` PR 6 deferred section._`,
    ``,
  ];
  for (const item of deferredCoverage()) {
    lines.push(`- **${item.name}** — ${item.reason}`);
  }
  lines.push(``);

  for (const r of results) {
    lines.push(`## ${r.id} — ${r.passed ? "PASS" : "FAIL"}`);
    lines.push(`> ${r.description}`);
    lines.push(``);
    if (r.error) {
      lines.push(`**Scenario error:** \`${r.error}\``);
      lines.push(``);
    }
    for (const t of r.turns) {
      lines.push(`### Turn ${t.turn}`);
      lines.push(`**Prompt:** "${t.prompt}"`);
      if (t.error) {
        lines.push(`**Error:** \`${t.error}\``);
      } else {
        lines.push(`**Response (truncated):**`);
        lines.push(`> ${t.response.slice(0, 500).replace(/\n/g, " ")}`);
      }
      if (t.results.length > 0) {
        lines.push(`**Assertions:**`);
        for (const a of t.results) {
          lines.push(`- ${a.passed ? "PASS" : "FAIL"} [${a.kind}] ${a.description}`);
        }
      }
      lines.push(`**Screenshot:** \`${t.screenshot}\``);
      lines.push(``);
    }
    if (r.postTurnResults?.length) {
      lines.push(`### Post-turn hook`);
      for (const a of r.postTurnResults) {
        lines.push(`- ${a.passed ? "PASS" : "FAIL"} ${a.description}`);
      }
      lines.push(``);
    }
    lines.push(`---`);
    lines.push(``);
  }

  const mdPath = path.join(outDir, "noi-variance-results.md");
  fs.writeFileSync(mdPath, lines.join("\n"), "utf8");

  console.log(`\n[PR6] ${passed}/${total} passed`);
  console.log(`[PR6] JSON: ${jsonPath}`);
  console.log(`[PR6] MD:   ${mdPath}\n`);
}

function deferredCoverage(): { name: string; reason: string }[] {
  return [
    {
      name: "Excel upload + re-run explanation",
      reason:
        "Concept-aware upload flow does not exist (no backend route + no UI component). No mocks accepted.",
    },
    {
      name: "Excel upload with missing required columns",
      reason: "Same as above — pending real upload flow.",
    },
    {
      name: "Conflicting uploaded data vs app data",
      reason: "Same as above — pending real upload flow.",
    },
    {
      name: "Confirmation execution (real DB write)",
      reason:
        "Per-test transactional rollback or no-op write tool not yet available. Current PR 6 stops at the confirmation boundary.",
    },
    {
      name: "Refresh-state on global commandbar overlay",
      reason:
        "Scenario 7 covers /lab/env/{envId}/copilot workspace surface only. The global commandbar's rehydration on hard refresh is unverified.",
    },
  ];
}
