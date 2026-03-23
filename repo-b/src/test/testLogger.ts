import fs from "node:fs";
import path from "node:path";

function safe(name: string): string {
  return name.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function isoNow(): string {
  return new Date().toISOString();
}

export function makeTestLogger(testName: string) {
  const runId = process.env.BM_TEST_RUN_ID || `run_${Date.now()}`;
  const root = path.resolve(process.cwd(), "../artifacts/test-logs/frontend-unit", runId);
  fs.mkdirSync(root, { recursive: true });

  const file = path.join(root, `${safe(testName)}.jsonl`);
  return {
    runId,
    log(action: string, message: string, context: Record<string, unknown> = {}) {
      const line = JSON.stringify({
        ts: isoNow(),
        level: "info",
        service: "frontend",
        env_id: null,
        business_id: null,
        user: "test",
        request_id: null,
        run_id: runId,
        action,
        message,
        context,
        duration_ms: null,
      });
      fs.appendFileSync(file, `${line}\n`, "utf8");
    },
  };
}
