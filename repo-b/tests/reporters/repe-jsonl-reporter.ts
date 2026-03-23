import fs from "node:fs";
import path from "node:path";
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from "@playwright/test/reporter";

function safe(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function isoNow(): string {
  return new Date().toISOString();
}

export default class RepeJsonlReporter implements Reporter {
  private runId = process.env.PW_RUN_ID || `run_${Date.now()}`;
  private root = path.resolve(process.cwd(), "../artifacts/playwright", this.runId);
  private failures: string[] = [];

  onBegin(_config: FullConfig, _suite: Suite): void {
    fs.mkdirSync(this.root, { recursive: true });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const file = path.join(this.root, `${safe(test.titlePath().join("__"))}.jsonl`);
    const entry = {
      ts: isoNow(),
      level: result.status === "passed" ? "info" : "error",
      service: "e2e",
      env_id: null,
      business_id: null,
      user: "test",
      request_id: null,
      run_id: this.runId,
      action: "e2e.test.end",
      message: `${test.title} => ${result.status}`,
      context: {
        duration_ms: result.duration,
        retry: result.retry,
        error: result.error?.message,
      },
      duration_ms: result.duration,
    };
    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, "utf8");

    if (result.status !== "passed") {
      this.failures.push(`${test.title} -> ${file}`);
    }
  }

  onEnd(_result: FullResult): void {
    if (this.failures.length > 0) {
      const summaryFile = path.join(this.root, "failure-summary.txt");
      const body = ["Failure Summary", ...this.failures].join("\n");
      fs.writeFileSync(summaryFile, body, "utf8");
      // eslint-disable-next-line no-console
      console.error(body);
      // eslint-disable-next-line no-console
      console.error(`Artifacts: ${this.root}`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`Artifacts: ${this.root}`);
    }
  }
}
