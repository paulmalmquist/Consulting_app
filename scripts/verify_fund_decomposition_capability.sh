#!/usr/bin/env bash
# Post-deploy capability gate for the Fund Decomposition overlay.
#
# Narrow-scope release integrity check. Hits the capability probe against a
# target origin and fails if the decomposition route is not capable on that
# environment's DB. This is the one release gate for this feature — it
# does NOT test correctness of the overlay math (that's covered by
# backend/tests/test_fund_decomposition.py).
#
# Usage:
#   scripts/verify_fund_decomposition_capability.sh <base_url> [<session_cookie>]
#
# Examples:
#   scripts/verify_fund_decomposition_capability.sh http://localhost:3000
#   scripts/verify_fund_decomposition_capability.sh https://www.paulmalmquist.com \
#     'bm_session=…'
#
# Exit codes:
#   0  capable=true — release is good
#   1  capable=false — release incomplete; feature will fail UX for users
#   2  invocation / transport error (bad URL, unreachable, invalid JSON)
#
# Deliberately narrow: one feature, one gate. A wider route→capability
# registry that runs this kind of check for every RE-touching route is a
# separate platform ticket.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <base_url> [<session_cookie>]" >&2
  exit 2
fi

BASE_URL="${1%/}"
SESSION_COOKIE="${2:-}"
ENDPOINT="${BASE_URL}/api/re/v2/funds/decomposition/capabilities"

CURL_ARGS=(-sS -m 15 -w "\nHTTP_STATUS=%{http_code}\n")
if [[ -n "$SESSION_COOKIE" ]]; then
  CURL_ARGS+=(-H "Cookie: ${SESSION_COOKIE}")
fi

set +e
RESPONSE="$(curl "${CURL_ARGS[@]}" "$ENDPOINT" 2>&1)"
CURL_EXIT=$?
set -e

if [[ $CURL_EXIT -ne 0 ]]; then
  echo "[verify-capability] curl failed: exit=$CURL_EXIT" >&2
  echo "$RESPONSE" >&2
  exit 2
fi

HTTP_STATUS="$(echo "$RESPONSE" | awk -F= '/^HTTP_STATUS=/{print $2}')"
BODY="$(echo "$RESPONSE" | sed '/^HTTP_STATUS=/d')"

if ! command -v python3 >/dev/null 2>&1; then
  echo "[verify-capability] python3 required for JSON parse" >&2
  exit 2
fi

# Python extraction, field-per-line. We pass the body via env var rather
# than stdin to avoid the heredoc-vs-pipe stdin conflict under `python3 -`.
PARSE_OUT="$(RESP_BODY="$BODY" python3 -c '
import json, os
raw = os.environ.get("RESP_BODY", "")
try:
    obj = json.loads(raw)
    parse_error = ""
except Exception as exc:
    obj = {}
    parse_error = str(exc)
if isinstance(obj, dict) and "detail" in obj and isinstance(obj["detail"], dict):
    obj = obj["detail"]
def scrub(s): return str(s).replace("\n", " ")
cap = obj.get("capable")
ec = obj.get("error_code")
fc = obj.get("fund_count")
mm = ",".join(obj.get("missing_migrations") or [])
mt = ",".join(obj.get("missing_tables") or [])
rs = " | ".join(obj.get("reasons") or [])
print("PARSE_ERROR=" + scrub(parse_error))
print("CAPABLE=" + scrub(cap))
print("ERROR_CODE=" + scrub(ec))
print("FUND_COUNT=" + scrub(fc))
print("MISSING_MIGRATIONS=" + scrub(mm))
print("MISSING_TABLES=" + scrub(mt))
print("REASONS=" + scrub(rs))
')"

extract_field() {
  echo "$PARSE_OUT" | awk -v k="$1" -F= 'BEGIN{n=length(k)+1} $0 ~ "^" k "=" {print substr($0, n+1); exit}'
}

PARSE_ERROR="$(extract_field PARSE_ERROR)"
CAPABLE="$(extract_field CAPABLE)"
ERROR_CODE="$(extract_field ERROR_CODE)"
FUND_COUNT="$(extract_field FUND_COUNT)"
MISSING_MIGRATIONS="$(extract_field MISSING_MIGRATIONS)"
MISSING_TABLES="$(extract_field MISSING_TABLES)"
REASONS="$(extract_field REASONS)"

if [[ -n "${PARSE_ERROR:-}" ]]; then
  echo "[verify-capability] JSON parse failed: $PARSE_ERROR" >&2
  echo "[verify-capability] http=$HTTP_STATUS raw body follows:" >&2
  echo "$BODY" | head -c 500 >&2
  echo >&2
  exit 2
fi

echo "[verify-capability] endpoint=$ENDPOINT"
echo "[verify-capability] http=$HTTP_STATUS capable=$CAPABLE error_code=$ERROR_CODE fund_count=$FUND_COUNT"
if [[ -n "${MISSING_MIGRATIONS:-}" ]]; then
  echo "[verify-capability] missing_migrations=$MISSING_MIGRATIONS"
fi
if [[ -n "${MISSING_TABLES:-}" ]]; then
  echo "[verify-capability] missing_tables=$MISSING_TABLES"
fi
if [[ -n "${REASONS:-}" ]]; then
  echo "[verify-capability] reasons: $REASONS"
fi

if [[ "$CAPABLE" != "True" ]]; then
  echo "[verify-capability] FAIL: env is not decomposition-capable" >&2
  echo "[verify-capability] Feature will render the unavailable-state banner for all users in this env." >&2
  exit 1
fi

echo "[verify-capability] OK — decomposition capable on $BASE_URL"
exit 0
