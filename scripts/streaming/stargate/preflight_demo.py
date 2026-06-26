#!/usr/bin/env python3
"""Demo preflight - PASS / WARN / FAIL readiness probe for the telemetry demo.

Read-only by default. It checks the surfaces a presenter touches and, for each live/cold surface, prints
a recommended demo action so an empty stream or a cold backend does not surprise anyone mid-demo. It never
mutates data unless you pass --warm (which only starts the two safe capture-mode replays).

Usage:
    python preflight_demo.py                          # defaults to http://localhost:8000
    python preflight_demo.py --base https://novendor.ai
    python preflight_demo.py --base https://novendor.ai --dry-run   # show what --warm WOULD start; POST nothing
    python preflight_demo.py --base https://novendor.ai --warm      # also start the capture-mode replays

Exit code: 0 if no FAIL (WARN is allowed), 1 if any FAIL.

What it checks:
    - frontend reachable
    - backend /api/version (reports the git sha)
    - backend telemetry health
    - model_runs.xlsx is a valid workbook through the proxy (status + content-type + zip magic)
    - anomaly_events.xlsx is a valid workbook (header-only when the stream is cold is honest, not broken)
    - an unknown export dataset fails closed with 404 + null_reason
    - Mission Control live anomaly rows (/stream/live events) -> recommended demo action

Lineage posture is intentionally not re-implemented here. Run the dedicated verifier alongside this:
    python verify_lineage.py --base <same base>

The X-Telemetry-* response headers are stripped by the Vercel proxy, so XLSX row counts are taken from
/stream/live (the same source the anomaly export reads), not from headers.
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
XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

GREEN, YELLOW, RED, CYAN, RESET = "\033[32m", "\033[33m", "\033[31m", "\033[36m", "\033[0m"
_counts = {"PASS": 0, "WARN": 0, "FAIL": 0}


def _emit(level: str, label: str, detail: str = "") -> None:
    _counts[level] += 1
    color = {"PASS": GREEN, "WARN": YELLOW, "FAIL": RED}[level]
    line = f"  {color}{level:<4}{RESET}  {label}"
    if detail:
        line += f"  - {detail}"
    print(line)


def _recommend(label: str, detail: str) -> None:
    print(f"        {CYAN}demo:{RESET} {label} - {detail}")


def _request(base: str, path: str, params: dict, timeout: float, method: str = "GET"):
    """Return (status_code, headers_dict_lowercased, body_bytes). Never raises."""
    qs = urllib.parse.urlencode(params)
    url = f"{base.rstrip('/')}{path}" + (f"?{qs}" if qs else "")
    req = urllib.request.Request(url, headers={"x-telemetry-route-env-id": DEMO_ENV_ID}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, {k.lower(): v for k, v in resp.headers.items()}, resp.read()
    except urllib.error.HTTPError as e:
        try:
            return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read()
        except Exception:
            return e.code, {}, b""
    except Exception:
        return 0, {}, b""


def _json(body: bytes) -> dict | None:
    try:
        out = json.loads(body.decode("utf-8"))
        return out if isinstance(out, dict) else None
    except Exception:
        return None


# ---- pure decision logic (unit-tested, no network) --------------------------------------------------

def classify_xlsx(status: int, content_type: str, body_head: bytes) -> tuple[str, str]:
    """A valid xlsx is a zip; it starts with the 'PK' magic bytes. Proxy strips the X-Telemetry-* headers,
    so we check transport + integrity here and read row counts from /stream/live elsewhere."""
    if status != 200:
        return "FAIL", f"HTTP {status}"
    if XLSX_CONTENT_TYPE not in (content_type or ""):
        return "FAIL", f"unexpected content-type {content_type!r}"
    if body_head[:2] != b"PK":
        return "FAIL", "body is not a valid workbook (no zip magic) - proxy may have corrupted the binary"
    return "PASS", "valid workbook through the proxy"


def classify_unknown_dataset(status: int, body: dict | None) -> tuple[str, str]:
    if status == 404 and isinstance(body, dict) and body.get("null_reason"):
        return "PASS", f"fails closed: 404 null_reason={body.get('null_reason')}"
    return "FAIL", f"expected 404+null_reason, got HTTP {status} / {body}"


def recommend_stream(events: int | None, worker_present: bool | None) -> tuple[str, str, str]:
    """Return (level, action, detail) for Mission Control. Cold is a WARN, not a FAIL."""
    if events is None:
        return "FAIL", "AVOID", "/stream/live did not return an events array"
    if events > 0:
        return "PASS", "SAFE TO SHOW", f"{events} live anomaly row(s)"
    worker = "worker running" if worker_present else "worker not running"
    return ("WARN", "COLD - warm first or show as honest empty state",
            f"0 live anomaly rows ({worker}); click Start stream on Mission Control "
            "(capture mode, no Confluent cost) and wait 30-60s, or show the fail-closed empty state")


def recommend_anomaly_export(events: int | None) -> str:
    if events and events > 0:
        return "anomaly_events.xlsx will contain rows - safe to export live"
    return "anomaly_events.xlsx returns a valid header-only workbook (honest) until the stream is warmed"


# ---- runner ----------------------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Telemetry demo preflight (PASS/WARN/FAIL + demo recommendations).")
    ap.add_argument("--base", default="http://localhost:8000", help="site base URL (the Vercel front door)")
    ap.add_argument("--env-id", default=DEMO_ENV_ID)
    ap.add_argument("--business-id", default=DEMO_BUSINESS_ID)
    ap.add_argument("--timeout", type=float, default=20.0)
    ap.add_argument("--dry-run", action="store_true", help="print what --warm WOULD start; POST nothing")
    ap.add_argument("--warm", action="store_true",
                    help="also start the capture-mode replays (Mission Control stream + Stargate). Safe, "
                         "deterministic, no live Confluent broker. Off by default.")
    args = ap.parse_args(argv)

    tenant = {"env_id": args.env_id, "business_id": args.business_id}
    base = args.base.rstrip("/")
    print(f"Demo preflight -> {base}  (env={args.env_id})\n")

    # 1. frontend reachable
    code, _, _ = _request(base, "/", {}, args.timeout)
    _emit("PASS" if code == 200 else "FAIL", "frontend reachable",
          "" if code == 200 else f"HTTP {code} (Vercel cold or down?)")

    # 2. /api/version
    code, _, body = _request(base, "/api/version", {}, args.timeout)
    sha = (_json(body) or {}).get("git_sha")
    _emit("PASS" if code == 200 and sha else "FAIL", "backend /api/version",
          f"git_sha={sha[:8]}" if sha else f"HTTP {code} (backend cold or down?)")

    # 3. backend telemetry health
    code, _, body = _request(base, "/api/telemetry/health", {}, args.timeout)
    hb = _json(body) or {}
    _emit("PASS" if code == 200 and hb.get("status") == "ok" else "FAIL", "backend telemetry health",
          f"promoted_models={hb.get('promoted_models')}" if code == 200 else f"HTTP {code}")

    # 4-5. export workbooks valid through the proxy
    for ds in ("model_runs", "anomaly_events"):
        code, headers, body = _request(base, f"/api/telemetry/export/{ds}.xlsx", tenant, args.timeout)
        level, detail = classify_xlsx(code, headers.get("content-type", ""), body)
        _emit(level, f"{ds}.xlsx", detail)

    # 6. unknown dataset fails closed
    code, _, body = _request(base, "/api/telemetry/export/__preflight_unknown__.xlsx", tenant, args.timeout)
    level, detail = classify_unknown_dataset(code, _json(body))
    _emit(level, "unknown export dataset fails closed", detail)

    # 7. Mission Control live anomaly rows -> recommendation
    code, _, body = _request(base, "/api/telemetry/stream/live", tenant, args.timeout)
    live = _json(body) if code == 200 else None
    events = len(live.get("events") or []) if isinstance(live, dict) and "events" in live else None
    worker = live.get("worker_present") if isinstance(live, dict) else None
    level, action, detail = recommend_stream(events, worker)
    _emit(level, "Mission Control live anomaly rows", f"events={events}")
    _recommend(action, detail)
    _recommend("anomaly export", recommend_anomaly_export(events))
    _recommend("Stargate Live",
               "start the recorded capture before showing /stargate if you want live SSE rows")

    # lineage posture is a separate, dedicated verifier
    print(f"\n  note: run  {CYAN}python verify_lineage.py --base {base}{RESET}  for the full lineage posture.")

    # warm / dry-run
    warm_targets = [
        ("Mission Control ingest worker (capture mode)", "POST", "/api/telemetry/stream/control", tenant),
        ("Stargate recorded capture replay", "POST", "/stargate/replay/cycle", {}),
    ]
    if args.dry_run or args.warm:
        print()
        for label, method, path, params in warm_targets:
            if args.warm and not args.dry_run:
                code, _, body = _request(base, path, params, args.timeout, method=method)
                jb = _json(body) or {}
                status = jb.get("status") or jb.get("mode") or f"HTTP {code}"
                _emit("PASS" if code == 200 else "WARN", f"warm: {label}",
                      f"{status} (auth may be required through the proxy)" if code != 200 else str(status))
            else:
                _recommend("would start (dry-run)", f"{method} {path}  [{label}]")

    print(f"\n  {_counts['PASS']} PASS / {_counts['WARN']} WARN / {_counts['FAIL']} FAIL")
    if _counts["FAIL"]:
        print(f"  {RED}NOT READY{RESET}: resolve the FAIL line(s) before the demo.")
        return 1
    if _counts["WARN"]:
        print(f"  {YELLOW}READY with cold surfaces{RESET}: warm them or show them as honest fail-closed examples.")
    else:
        print(f"  {GREEN}READY{RESET}: all demo surfaces are live.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
