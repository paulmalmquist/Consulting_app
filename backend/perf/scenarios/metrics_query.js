import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';

const headerMissing = new Rate('header_missing');
const diagnosticsMissing = new Rate('diagnostics_missing');

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:8000';
const DATA_TIER = (__ENV.DATA_TIER || 'S').toLowerCase();
const RUN_ID = __ENV.RUN_ID || `perf-${Date.now()}`;
const VUS = Number(__ENV.VUS || 5);
const DURATION = __ENV.DURATION || '30s';
const FAILURE_MODE = (__ENV.FAILURE_MODE || 'none').toLowerCase();

const P95_MS = Number(__ENV.P95_MS || 250);
const P99_MS = Number(__ENV.P99_MS || 500);
const ERROR_RATE = Number(__ENV.ERROR_RATE || 0.01);

const fixturePath = `../fixtures/metrics_queries/${DATA_TIER}.json`;
const fixture = JSON.parse(open(fixturePath));

if (!Array.isArray(fixture.business_ids) || fixture.business_ids.length === 0) {
  throw new Error(`Fixture ${fixturePath} has no business_ids. Run seed_perf_metrics.py first.`);
}

function yyyymmdd(deltaDays) {
  const now = new Date();
  const d = new Date(now.getTime() - deltaDays * 86400000);
  return d.toISOString().slice(0, 10);
}

function buildCases() {
  const cases = [];
  const dimensions = fixture.dimensions || [null, 'date', 'scope'];
  const counts = fixture.metric_key_counts || [1, 5, 6];
  const ranges = fixture.date_ranges || [
    { label: '7d', days: 7 },
    { label: '90d', days: 90 },
    { label: '365d', days: 365 }
  ];

  for (const dimension of dimensions) {
    for (const count of counts) {
      for (const range of ranges) {
        cases.push({ dimension, count, rangeDays: range.days });
      }
    }
  }
  return cases;
}

const matrix = buildCases();

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: {
    http_req_failed: [`rate<${ERROR_RATE}`],
    http_req_duration: [`p(95)<${P95_MS}`, `p(99)<${P99_MS}`],
    header_missing: ['rate<0.01'],
    diagnostics_missing: ['rate<0.01']
  }
};

export default function () {
  const caseIdx = (__VU + __ITER) % matrix.length;
  const businessIdx = (__VU + __ITER) % fixture.business_ids.length;
  const c = matrix[caseIdx];

  const metricCount = Math.min(c.count, fixture.metric_keys.length);
  const metricKeys = fixture.metric_keys.slice(0, metricCount);

  let businessId = fixture.business_ids[businessIdx];
  let keys = metricKeys;
  let expectedStatus = 200;

  if (FAILURE_MODE === 'invalid_business_id') {
    businessId = '00000000-0000-0000-0000-000000000000';
    expectedStatus = 404;
  }
  if (FAILURE_MODE === 'empty_metric_keys') {
    keys = [];
    expectedStatus = 400;
  }

  const payload = {
    business_id: businessId,
    metric_keys: keys,
    dimension: c.dimension,
    date_from: yyyymmdd(c.rangeDays),
    date_to: yyyymmdd(0),
    refresh: false
  };

  const res = http.post(`${BASE_URL}/api/metrics/query`, JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json',
      'x-run-id': `${RUN_ID}:${DATA_TIER}:dim=${String(c.dimension)}:keys=${keys.length}:days=${c.rangeDays}`
    }
  });

  const ok = check(res, {
    [`status ${expectedStatus}`]: (r) => r.status === expectedStatus,
    'x-request-id present': (r) => !!r.headers['X-Request-Id']
  });

  let json = null;
  try {
    json = res.json();
  } catch (_e) {
    json = null;
  }

  const hasRunHeader = !!res.headers['X-Run-Id'];
  headerMissing.add(hasRunHeader ? 0 : 1);

  const hasDiagnostics = expectedStatus !== 200 ? true : !!(json && typeof json.query_hash === 'string');
  diagnosticsMissing.add(hasDiagnostics ? 0 : 1);

  if (!ok && json && json.detail) {
    console.error(`metrics_query error detail=${json.detail}`);
  }
}
