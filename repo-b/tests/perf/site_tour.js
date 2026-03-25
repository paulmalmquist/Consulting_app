/**
 * site_tour.js — k6 performance tour of paulmalmquist.com
 *
 * Usage:
 *   k6 run site_tour.js \
 *     -e BASE_URL=https://paulmalmquist.com \
 *     -e ENV_ID=<envId> \
 *     -e ADMIN_EMAIL=admin@paulmalmquist.com \
 *     -e ADMIN_PASSWORD=<password>
 *
 * Thresholds:
 *   - 95th percentile response < 1500ms for all API calls
 *   - Error rate < 2%
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Trend, Rate } from "k6/metrics";

// ── Config ───────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || "https://paulmalmquist.com";
const ENV_ID   = __ENV.ENV_ID   || "";
const API_BASE = `${BASE_URL}/api`;

// ── Custom metrics ────────────────────────────────────────────────

const apiLatency  = new Trend("api_latency",  true);
const errorRate   = new Rate("error_rate");

// ── Thresholds ───────────────────────────────────────────────────

export const options = {
  scenarios: {
    desktop_tour: {
      executor: "per-vu-iterations",
      vus: 1,
      iterations: 3,
      maxDuration: "3m",
    },
  },
  thresholds: {
    api_latency:          ["p(95)<1500"],
    error_rate:           ["rate<0.02"],
    http_req_failed:      ["rate<0.02"],
    http_req_duration:    ["p(95)<2000"],
  },
};

// ── Helpers ──────────────────────────────────────────────────────

function get(path, params = {}) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = http.get(url, {
    headers: {
      "X-Env-Id":      ENV_ID,
      "Content-Type":  "application/json",
    },
    timeout: "10s",
    ...params,
  });
  apiLatency.add(res.timings.duration, { endpoint: path });
  errorRate.add(res.status >= 400);
  return res;
}

function checkRes(res, name, expectedStatus = 200) {
  const ok = check(res, {
    [`${name}: status ${expectedStatus}`]: (r) => r.status === expectedStatus,
    [`${name}: response time < 1500ms`]:   (r) => r.timings.duration < 1500,
    [`${name}: has body`]:                 (r) => r.body && r.body.length > 0,
  });
  if (!ok) {
    console.warn(`FAIL [${name}] status=${res.status} duration=${res.timings.duration}ms`);
  }
}

// ── Main tour ────────────────────────────────────────────────────

export default function () {
  group("Health", () => {
    const res = get(`${BASE_URL}/health`);
    checkRes(res, "health");
    sleep(0.5);
  });

  group("REPE — Fund List", () => {
    if (!ENV_ID) { console.warn("ENV_ID not set — skipping REPE endpoints"); return; }
    const res = get(`/re/v2/funds?env_id=${ENV_ID}&limit=20`);
    checkRes(res, "funds list");
    sleep(0.5);
  });

  group("REPE — Assets", () => {
    if (!ENV_ID) return;
    const res = get(`/re/v2/assets?env_id=${ENV_ID}&limit=20`);
    checkRes(res, "assets list");
    sleep(0.5);
  });

  group("REPE — Models", () => {
    if (!ENV_ID) return;
    const res = get(`/re/v2/models?env_id=${ENV_ID}&limit=10`);
    checkRes(res, "models list");
    sleep(0.5);
  });

  group("Development Portfolio", () => {
    if (!ENV_ID) return;
    const res = get(`/dev/v1/portfolio`, {
      headers: {
        "X-Env-Id": ENV_ID,
        "Content-Type": "application/json",
      },
    });
    checkRes(res, "dev portfolio");
    sleep(0.5);
  });

  group("PDS — Command Center", () => {
    if (!ENV_ID) return;
    const res = get(`/pds/v2/command-center?env_id=${ENV_ID}`);
    checkRes(res, "pds command center");
    sleep(0.5);
  });

  group("PDS — Projects", () => {
    if (!ENV_ID) return;
    const res = get(`/pds/v1/projects?env_id=${ENV_ID}&limit=20`);
    checkRes(res, "pds projects");
    sleep(0.5);
  });

  group("Dashboards", () => {
    if (!ENV_ID) return;
    const res = get(`/re/v2/dashboards?env_id=${ENV_ID}&limit=10`);
    checkRes(res, "dashboards list");
    sleep(0.5);
  });

  group("AI Gateway — Health", () => {
    const res = get(`/ai/gateway/health`);
    // Gateway health may return 401 without auth — just check it responds fast
    check(res, {
      "ai gateway: responds < 800ms": (r) => r.timings.duration < 800,
    });
    sleep(1);
  });

  sleep(1);
}

// ── Summary ──────────────────────────────────────────────────────

export function handleSummary(data) {
  const metrics = data.metrics;
  const p95 = metrics?.api_latency?.values?.["p(95)"] ?? "n/a";
  const errPct = ((metrics?.error_rate?.values?.rate ?? 0) * 100).toFixed(1);

  console.log("\n====== Site Audit Summary ======");
  console.log(`API p95 latency:  ${typeof p95 === "number" ? p95.toFixed(0) + "ms" : p95}`);
  console.log(`Error rate:       ${errPct}%`);
  console.log(`Total requests:   ${metrics?.http_reqs?.values?.count ?? "n/a"}`);
  console.log("================================\n");

  return {
    stdout: JSON.stringify(data, null, 2),
  };
}
