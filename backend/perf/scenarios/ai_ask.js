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

// Parse SSE body into typed events: [{ event, data }]
function parseSseEvents(body) {
  const events = [];
  if (!body) return events;
  const lines = body.split('\n');
  let currentEvent = null;
  let currentData = null;
  for (const line of lines) {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      currentData = line.slice(6).trim();
    } else if (line === '' && currentEvent !== null) {
      events.push({ event: currentEvent, data: currentData });
      currentEvent = null;
      currentData = null;
    }
  }
  return events;
}

export default function () {
  const idx = (__VU + __ITER) % prompts.length;
  const prompt = prompts[idx];

  let message = prompt.prompt;
  let expectedStatus = 200;

  if (FAILURE_MODE === 'oversized_prompt') {
    message = 'x'.repeat(22000);
    expectedStatus = 422;
  }
  // sidecar_unavailable is a legacy failure mode — gateway is always available
  // so treat it as a normal request
  if (FAILURE_MODE === 'sidecar_unavailable') {
    expectedStatus = 200;
  }

  const payload = JSON.stringify({ message });

  const res = http.post(`${BASE_URL}/api/ai/gateway/ask`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'x-run-id': `${RUN_ID}:${prompt.subject}:${prompt.action}:${DATA_TIER}`,
      'x-bm-actor': 'perf-runner',
    },
  });

  const ok = check(res, {
    [`status ${expectedStatus}`]: (r) => r.status === expectedStatus,
    'x-request-id present': (r) => !!r.headers['X-Request-Id'],
  });

  if (!ok && res.status !== expectedStatus) {
    console.error(`ai_ask error status=${res.status} body=${res.body ? res.body.slice(0, 200) : ''}`);
  }

  // Parse SSE events from response body
  const sseEvents = parseSseEvents(res.body || '');
  const eventNames = sseEvents.map((e) => e.event);

  // diagnostics: gateway streams a 'done' event with elapsed_ms
  let hasDiagnostics = false;
  if (expectedStatus !== 200) {
    hasDiagnostics = true; // not measured on error paths
  } else {
    const doneEvent = sseEvents.find((e) => e.event === 'done');
    if (doneEvent && doneEvent.data) {
      try {
        const doneData = JSON.parse(doneEvent.data);
        hasDiagnostics = typeof doneData.elapsed_ms === 'number';
      } catch (_e) {
        hasDiagnostics = false;
      }
    }
  }
  diagnosticsMissing.add(hasDiagnostics ? 0 : 1);

  const hasRunHeader = !!res.headers['X-Run-Id'];
  headerMissing.add(hasRunHeader ? 0 : 1);

  // citations: look for 'citation' SSE events
  const citationCount = eventNames.filter((e) => e === 'citation').length;
  if (expectedStatus === 200 && prompt.non_trivial) {
    citationMissing.add(citationCount > 0 ? 0 : 1);
  } else {
    citationMissing.add(0);
  }
}
