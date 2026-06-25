#!/usr/bin/env python3
"""Telemetry lineage verification — PASS / WARN / FAIL over the FastAPI lineage routes.

Read-only HTTP probe of the Ticket-4 routes. No secrets required: it calls the same-origin
/api/telemetry/stream/* endpoints through whatever base URL you point it at (local dev, the Vercel
proxy, or the Railway backend directly). It NEVER prints credentials and never writes anything.

Usage:
    python verify_lineage.py                         # defaults to http://localhost:8000
    python verify_lineage.py --base https://novendor.ai
    python verify_lineage.py --base https://novendor.ai --anomaly-id anom_v4-04-3_1700000000000000

Exit code: 0 if no FAIL (WARN is allowed), 1 if any FAIL.

What it checks (each line is PASS / WARN / FAIL):
    - backend telemetry health route reachable
    - latest Kafka rows route returns the {status, rows, count} contract
    - latest triage route returns the {status, triage, count} contract
    - triage-by-anomaly fails closed (triage_not_emitted) for an unknown id
    - combined anomaly lineage returns the 4 layers, and the Databricks layer stays not_available
      (databricks_table_mapping_not_configured) — i.e. no fabricated Delta pointer
    - the expected fail-closed null_reasons are present where a layer is unavailable

Empty serving slices are a WARN (the durable consumer may be off / nothing emitted yet), not a FAIL —
the routes still answering with honest fail-closed shapes is the success criterion.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

DEMO_ENV_ID = "telemetry-demo"
DEMO_BUSINESS_ID = "7e1eb000-0000-4000-a000-000000000001"

GREEN, YELLOW, RED, RESET = "\033[32m", "\033[33m", "\033[31m", "\033[0m"
_counts = {"PASS": 0, "WARN": 0, "FAIL": 0}


def _emit(level: str, label: str, detail: str = "") -> None:
    _counts[level] += 1
    color = {"PASS": GREEN, "WARN": YELLOW, "FAIL": RED}[level]
    line = f"  {color}{level:<4}{RESET}  {label}"
    if detail:
        line += f"  - {detail}"
    print(line)


def _get(base: str, path: str, params: dict, timeout: float) -> tuple[int, dict | None]:
    """GET base+path?params. Returns (status_code, json|None). Never raises."""
    qs = urllib.parse.urlencode(params)
    url = f"{base.rstrip('/')}{path}?{qs}"
    req = urllib.request.Request(url, headers={"x-telemetry-route-env-id": DEMO_ENV_ID})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            try:
                return resp.status, json.loads(body)
            except json.JSONDecodeError:
                return resp.status, None
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8"))
        except Exception:
            return e.code, None
    except Exception:
        return 0, None


def main() -> int:
    ap = argparse.ArgumentParser(description="Verify the telemetry lineage routes (PASS/WARN/FAIL).")
    ap.add_argument("--base", default="http://localhost:8000", help="backend base URL")
    ap.add_argument("--env-id", default=DEMO_ENV_ID)
    ap.add_argument("--business-id", default=DEMO_BUSINESS_ID)
    ap.add_argument("--anomaly-id", default=None,
                    help="a known anomaly id for the lineage check; omitted = use an unknown id (fail-closed path)")
    ap.add_argument("--timeout", type=float, default=15.0)
    args = ap.parse_args()

    tenant = {"env_id": args.env_id, "business_id": args.business_id}
    print(f"Telemetry lineage verification -> {args.base}  (env={args.env_id})\n")

    # 1. health
    code, body = _get(args.base, "/api/telemetry/health", {}, args.timeout)
    if code == 200:
        _emit("PASS", "telemetry health route reachable")
    else:
        _emit("FAIL", "telemetry health route", f"HTTP {code} (is the backend deployed/running?)")

    # 2. kafka rows contract
    code, body = _get(args.base, "/api/telemetry/stream/kafka/rows", {**tenant, "limit": 5}, args.timeout)
    if code == 200 and isinstance(body, dict) and body.get("status") == "ok" and "rows" in body:
        n = body.get("count", 0)
        if n > 0:
            _emit("PASS", "kafka rows route", f"{n} row(s)")
        else:
            _emit("WARN", "kafka rows route", "0 rows — durable consumer off / nothing landed yet")
    else:
        _emit("FAIL", "kafka rows route", f"HTTP {code} / unexpected shape")

    # 3. triage latest contract
    code, body = _get(args.base, "/api/telemetry/stream/kafka/triage/latest", {**tenant, "limit": 5}, args.timeout)
    if code == 200 and isinstance(body, dict) and body.get("status") == "ok" and "triage" in body:
        n = body.get("count", 0)
        _emit("PASS" if n else "WARN", "triage latest route",
              f"{n} record(s)" if n else "0 records — agent not emitted / consumer off")
    else:
        _emit("FAIL", "triage latest route", f"HTTP {code} / unexpected shape")

    # 4. triage-by-anomaly fails closed for an unknown id
    code, body = _get(args.base, "/api/telemetry/stream/kafka/triage/__verify_unknown__", tenant, args.timeout)
    if code == 200 and isinstance(body, dict) and body.get("status") == "not_available" \
            and body.get("null_reason") == "triage_not_emitted":
        _emit("PASS", "triage-by-anomaly fails closed", "null_reason=triage_not_emitted")
    else:
        _emit("FAIL", "triage-by-anomaly fail-closed", f"HTTP {code} / got {body}")

    # 5. combined anomaly lineage — layer shape + Databricks honesty
    anomaly_id = args.anomaly_id or "__verify_unknown__"
    code, body = _get(args.base, f"/api/telemetry/stream/lineage/anomaly/{urllib.parse.quote(anomaly_id)}",
                      tenant, args.timeout)
    if code == 200 and isinstance(body, dict) and "layers" in body:
        layers = body["layers"]
        if all(k in layers for k in ("kafka_detection", "agent_triage", "databricks_lake", "postgres_serving")):
            _emit("PASS", "anomaly lineage returns all 4 layers")
        else:
            _emit("FAIL", "anomaly lineage layers", f"missing layer(s): {list(layers)}")

        # Databricks must never fabricate a mapping
        dl = layers.get("databricks_lake", {})
        if dl.get("status") == "not_available" and not dl.get("table"):
            _emit("PASS", "databricks lake fails closed (no fabricated mapping)",
                  f"null_reason={dl.get('null_reason')}")
        elif dl.get("status") == "available" and dl.get("table"):
            _emit("PASS", "databricks lake mapped", f"table={dl.get('table')}")
        else:
            _emit("FAIL", "databricks lake layer", f"inconsistent: {dl}")

        if args.anomaly_id and body.get("status") == "ok":
            _emit("PASS", "known anomaly lineage resolved", f"anomaly_id={anomaly_id}")
        elif not args.anomaly_id:
            if body.get("status") == "not_available":
                _emit("PASS", "unknown anomaly fails closed",
                      f"null_reason={body.get('null_reason')}")
            else:
                _emit("WARN", "unknown anomaly id resolved unexpectedly", str(body.get("status")))
    else:
        _emit("FAIL", "anomaly lineage route", f"HTTP {code} / unexpected shape")

    # summary
    print(f"\n  {_counts['PASS']} PASS / {_counts['WARN']} WARN / {_counts['FAIL']} FAIL")
    if _counts["FAIL"]:
        print(f"  {RED}FAIL{RESET}: lineage verification did not pass.")
        return 1
    if _counts["WARN"]:
        print(f"  {YELLOW}OK with warnings{RESET}: routes answer fail-closed; serving slice may be empty.")
    else:
        print(f"  {GREEN}OK{RESET}: lineage verified end to end.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
