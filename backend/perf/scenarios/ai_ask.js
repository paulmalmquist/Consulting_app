import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';

const citationMissing = new Rate('citation_missing');
const headerMissing = new Rate('header_missing');
const diagnosticsMissing = new Rate('diagnostics_missing');

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:8000';
const DATA_TIER = (__ENV.DATA_TIER || 'S').toUpperCase();
const SUBJECT = (__ENV.SUBJECT || 'all').toLowerCase();
const ACTION = (__ENV.ACTION || 'all').toLowerCase();
const RUN_ID = __ENV.RUN_ID || `perf-${Date.now()}`;
const FAILURE_MODE = (__ENV.FAILURE_MODE || 'none').toLowerCase();
const VUS = Number(__ENV.VUS || 5);
const DURATION = __ENV.DURATION || '30s';

const P95_MS = Number(__ENV.P95_MS || 2500);
const P99_MS = Number(__ENV.P99_MS || 12000);
const ERROR_RATE = Number(__ENV.ERROR_RATE || 0.02);

const scopeByTier = {
  S: { max_files: 8, max_bytes: 120000 },
  M: { max_files: 12, max_bytes: 250000 },
  L: { max_files: 18, max_bytes: 450000 }
};

function loadPrompts(path) {
  return JSON.parse(open(path));
}

const allPrompts = []
  .concat(loadPrompts('../fixtures/prompts/repe.json'))
  .concat(loadPrompts('../fixtures/prompts/underwriting.json'))
  .concat(loadPrompts('../fixtures/prompts/legalops.json'))
  .concat(loadPrompts('../fixtures/prompts/mixed.json'));

const prompts = allPrompts.filter((p) => {
  const subjectOk = SUBJECT === 'all' || p.subject === SUBJECT;
  const actionOk = ACTION === 'all' || p.action === ACTION;
  return subjectOk && actionOk;
});

if (prompts.length === 0) {
  throw new Error(`No prompts matched SUBJECT=${SUBJECT} ACTION=${ACTION}`);
}

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: {
    http_req_failed: [`rate<${ERROR_RATE}`],
    http_req_duration: [`p(95)<${P95_MS}`, `p(99)<${P99_MS}`],
    citation_missing: ['rate<0.01'],
    header_missing: ['rate<0.01'],
    diagnostics_missing: ['rate<0.01']
  }
};

export default function () {
  const idx = (__VU + __ITER) % prompts.length;
  const prompt = prompts[idx];
  const scope = scopeByTier[DATA_TIER] || scopeByTier.S;

  let payload = {
    prompt: prompt.prompt,
    scope,
    retrieval: {
      query: prompt.retrieval_query || prompt.prompt,
      top_k: 8
    }
  };

  let expectedStatus = 200;
  if (FAILURE_MODE === 'oversized_prompt') {
    payload = { ...payload, prompt: 'x'.repeat(22000) };
    expectedStatus = 422;
  } else if (FAILURE_MODE === 'sidecar_unavailable') {
    expectedStatus = 503;
  }

  const res = http.post(`${BASE_URL}/api/ai/ask`, JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json',
      'x-run-id': `${RUN_ID}:${prompt.subject}:${prompt.action}:${DATA_TIER}`
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

  const hasDiagnostics =
    expectedStatus !== 200 ? true : !!(json && json.diagnostics && typeof json.diagnostics.elapsed_ms === 'number');
  diagnosticsMissing.add(hasDiagnostics ? 0 : 1);

  const hasRunHeader = !!res.headers['X-Run-Id'];
  headerMissing.add(hasRunHeader ? 0 : 1);

  const citations = json && Array.isArray(json.citations) ? json.citations.length : 0;
  if (expectedStatus === 200 && prompt.non_trivial) {
    citationMissing.add(citations > 0 ? 0 : 1);
  } else {
    citationMissing.add(0);
  }

  if (!ok && json && json.detail) {
    console.error(`ai_ask error detail=${json.detail}`);
  }
}
