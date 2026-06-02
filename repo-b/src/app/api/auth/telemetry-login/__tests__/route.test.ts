import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST } from "../route";

const ENV = "dc82d39d-9be2-49b0-a01d-c7181b13a8b6";

beforeEach(() => {
  process.env.BM_SESSION_SECRET = "test-secret";
  process.env.TELEMETRY_REVIEWER_USERNAME = "telemetry";
  process.env.TELEMETRY_REVIEWER_PASSWORD = "relativity_11";
  process.env.TELEMETRY_REVIEWER_ENV_ID = ENV;
});

afterEach(() => {
  delete process.env.TELEMETRY_REVIEWER_USERNAME;
  delete process.env.TELEMETRY_REVIEWER_PASSWORD;
  delete process.env.TELEMETRY_REVIEWER_ENV_ID;
});

function jsonRequest(body: unknown): Request {
  return new Request("https://app.example.com/api/auth/telemetry-login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/telemetry-login", () => {
  it("issues a scoped bm_session and redirects to the telemetry home for valid creds", async () => {
    const res = await POST(jsonRequest({ username: "telemetry", password: "relativity_11" }) as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; redirectTo?: string };
    expect(body.ok).toBe(true);
    expect(body.redirectTo).toBe(`/lab/env/${ENV}/telemetry`);
    expect(res.headers.get("set-cookie") || "").toContain("bm_session=");
  });

  it("rejects a wrong password (401, no session)", async () => {
    const res = await POST(jsonRequest({ username: "telemetry", password: "nope" }) as never);
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("rejects a wrong username (401)", async () => {
    const res = await POST(jsonRequest({ username: "admin", password: "relativity_11" }) as never);
    expect(res.status).toBe(401);
  });

  it("is disabled (401, fail closed) when the env vars are not configured", async () => {
    delete process.env.TELEMETRY_REVIEWER_PASSWORD;
    const res = await POST(jsonRequest({ username: "telemetry", password: "relativity_11" }) as never);
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
