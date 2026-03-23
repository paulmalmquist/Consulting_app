import fs from "node:fs";
import path from "node:path";
import { expect, type BrowserContext, type Page, type Response, type Route } from "@playwright/test";

function isoNow(): string {
  return new Date().toISOString();
}

export function makeRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

export function makeStepLogger(testName: string, runId: string) {
  const root = path.resolve(process.cwd(), "../artifacts/playwright", runId);
  fs.mkdirSync(root, { recursive: true });
  const file = path.join(root, `${testName.replace(/[^a-zA-Z0-9_.-]/g, "_")}.steps.jsonl`);

  return {
    file,
    log(action: string, message: string, context: Record<string, unknown> = {}) {
      const entry = {
        ts: isoNow(),
        level: "info",
        service: "e2e",
        env_id: null,
        business_id: null,
        user: "test",
        request_id: null,
        run_id: runId,
        action,
        message,
        context,
        duration_ms: null,
      };
      fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, "utf8");
    },
  };
}

export async function initializeRunContext(page: Page, runId: string): Promise<void> {
  await page.goto("/");
  await page.evaluate((rid) => {
    localStorage.setItem("bm_run_id", rid);
  }, runId);
}

export async function injectRunIdHeaders(context: BrowserContext, runId: string): Promise<void> {
  await context.route("**/*", async (route: Route) => {
    const headers = {
      ...route.request().headers(),
      "x-run-id": runId,
    };
    await route.continue({ headers });
  });
}

export async function assertResponseHasRequestId(response: Response): Promise<void> {
  const requestId = response.headers()["x-request-id"];
  expect(requestId).toBeTruthy();
}
