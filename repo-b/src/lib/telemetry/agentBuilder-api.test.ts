import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID } from "./api";
import { dryRunWorkflow, getPalette } from "./agentBuilder-api";

// This bug was a tenant-context-propagation break: the Agent Builder API stopped sending
// env_id/business_id, so the headerless reviewer login 403'd. Test the pipe directly —
// the real agentBuilder-api + real apiFetch must put the demo scope on the request URL for
// both a GET and a POST. Mock only the network boundary (global fetch).

function captureFetch() {
  const calls: string[] = [];
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    calls.push(typeof input === "string" ? input : input.toString());
    return new Response(JSON.stringify({ schema_version: "agent-graph/v1", nodes: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", mock);
  return calls;
}

describe("agentBuilder-api scope propagation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("appends the demo scope to a GET request URL", async () => {
    const calls = captureFetch();
    await getPalette();
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]);
    expect(url.pathname).toBe("/api/agent-builder/palette");
    expect(url.searchParams.get("env_id")).toBe(TELEMETRY_DEMO_ENV_ID);
    expect(url.searchParams.get("business_id")).toBe(TELEMETRY_DEMO_BUSINESS_ID);
  });

  it("appends the demo scope to a POST request URL", async () => {
    const calls = captureFetch();
    await dryRunWorkflow("wf-1", { run_key: "FD001-test-001" });
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]);
    expect(url.pathname).toBe("/api/agent-builder/workflows/wf-1/dry-run");
    expect(url.searchParams.get("env_id")).toBe(TELEMETRY_DEMO_ENV_ID);
    expect(url.searchParams.get("business_id")).toBe(TELEMETRY_DEMO_BUSINESS_ID);
  });
});
