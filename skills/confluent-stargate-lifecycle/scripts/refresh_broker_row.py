#!/usr/bin/env python3
"""Scheduled refresh of the Confluent broker cost-state row on the Telemetry
Mission Control PIPELINE panel.

Runs in CI (GitHub Actions, ~every 15 min). Probes the REAL Confluent state via the
Confluent Cloud REST API with HTTP-basic API-key auth (the `confluent` CLI's
control-plane commands require a full username/password login that a service-account
key cannot do — so we call REST directly). Maps the state to an honest cost state
from OBSERVED FACTS ONLY and writes the broker row to tel_pipeline_status.

Reads: cluster existence (cmk/v2) + connectors (connect/v1) with the Cloud key.
Flink running statements are BEST EFFORT (need a Flink-scoped key + org id); if those
are absent the reason notes "flink not checked" rather than failing.

Honest states (never inferred, never claimed without observation):
  hot   — cluster up AND (>=1 connector OR >=1 running Flink statement)
  warm  — cluster up, 0 connectors, 0 running statements (idle; topics retained)
  gone  — Kafka cluster not found AND Flink pools not found
  stale — the check itself FAILED; we could not verify state. Written with the
          failure reason; NEVER overwrites the row with a fresh-looking status.

Exit codes: 0 = row written (any honest state, incl. 'stale' on a handled check
failure). Non-zero only if we could not even reach the DB to record 'stale'.

Auth env (service account):
  CONFLUENT_CLOUD_API_KEY / CONFLUENT_CLOUD_API_SECRET  (Cloud API key)
  CONFLUENT_ENV_ID, CONFLUENT_CLUSTER_ID                (defaults baked below)
  CONFLUENT_FLINK_CLOUD, CONFLUENT_FLINK_REGION
  TELEMETRY_DATABASE_URL                                (Lakebase; the graph)
"""
from __future__ import annotations

import base64
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

# Reuse the single row-writer so there is exactly one place that touches the DB.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import graph_bind  # noqa: E402

ENV_ID = os.environ.get("CONFLUENT_ENV_ID", "env-vwkk2z")
CLUSTER_ID = os.environ.get("CONFLUENT_CLUSTER_ID", "lkc-gqpvvyv")
FLINK_CLOUD = os.environ.get("CONFLUENT_FLINK_CLOUD", "gcp")
FLINK_REGION = os.environ.get("CONFLUENT_FLINK_REGION", "us-east1")
FLINK_POOLS = ["lfcp-22wznzq", "lfcp-v7pqqvj"]
RUNNING_STATES = {"RUNNING", "PENDING", "DEGRADED"}

CLOUD_API = "https://api.confluent.cloud"
# Flink statements need a region data-plane host + a Flink-scoped key — kept best-effort.
FLINK_API = f"https://flink.{FLINK_REGION}.{FLINK_CLOUD}.confluent.cloud"


class CheckError(Exception):
    """A probe failed in a way that means we cannot trust the observed state.
    Caller turns this into a 'stale' row — NEVER a fresh-looking status."""


class NotFoundError(CheckError):
    """The resource genuinely returned 404 — distinct from auth/network failure.
    Only this justifies declaring the lane 'gone'."""


def _utc_hhmm() -> str:
    return datetime.now(timezone.utc).strftime("%H:%MZ")


def _get(url: str, key: str, secret: str):
    """GET a Confluent REST endpoint with HTTP-basic API-key auth. Returns parsed JSON.
    Raises NotFoundError on 404, CheckError on any other non-2xx / transport error —
    so auth (401/403) and network failures are ambiguous, never read as 'gone'."""
    token = base64.b64encode(f"{key}:{secret}".encode()).decode()
    req = urllib.request.Request(url, headers={"Authorization": f"Basic {token}",
                                               "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise NotFoundError(f"GET {url} -> 404 not found")
        body = ""
        try:
            body = e.read().decode()[:200]
        except Exception:
            pass
        raise CheckError(f"GET {url} -> HTTP {e.code} {body}")
    except Exception as e:
        raise CheckError(f"GET {url} failed: {str(e)[:200]}")


def probe_state() -> tuple[str, str]:
    """Return (status, reason) from observed Confluent facts via the Cloud REST API.
    Raises CheckError if state cannot be observed (caller writes 'stale')."""
    key = os.environ.get("CONFLUENT_CLOUD_API_KEY", "")
    secret = os.environ.get("CONFLUENT_CLOUD_API_SECRET", "")
    if not key or not secret:
        raise CheckError("CONFLUENT_CLOUD_API_KEY/_SECRET not set — cannot observe state")

    # 1. Cluster existence (cmk v2). Only a genuine 404 (NotFoundError) means "gone";
    #    auth/network errors propagate as CheckError → 'stale'.
    cluster_missing = False
    try:
        _get(f"{CLOUD_API}/cmk/v2/clusters/{CLUSTER_ID}?environment={ENV_ID}", key, secret)
    except NotFoundError:
        cluster_missing = True

    if cluster_missing:
        return "gone", f"cluster {CLUSTER_ID} not found · recreate from export · checked {_utc_hhmm()}"

    # 2. Connectors (connect v1) — the primary active-cost signal.
    conns = _get(
        f"{CLOUD_API}/connect/v1/environments/{ENV_ID}/clusters/{CLUSTER_ID}/connectors",
        key, secret,
    )
    n_conn = len(conns) if isinstance(conns, list) else len(conns or {})

    # 3. Running Flink statements — BEST EFFORT. Needs a Flink-scoped key; if it isn't
    #    available we record that it wasn't checked rather than failing the whole probe.
    flink_note = ""
    n_running = None
    fkey = os.environ.get("CONFLUENT_FLINK_API_KEY", "")
    fsecret = os.environ.get("CONFLUENT_FLINK_API_SECRET", "")
    if fkey and fsecret:
        org = os.environ.get("CONFLUENT_ORG_ID", "")
        try:
            data = _get(
                f"{FLINK_API}/sql/v1/organizations/{org}/environments/{ENV_ID}/statements?page_size=100",
                fkey, fsecret,
            )
            stmts = data.get("data", []) if isinstance(data, dict) else []
            n_running = sum(1 for s in stmts
                            if (s.get("status") or {}).get("phase") in RUNNING_STATES)
        except CheckError as e:
            flink_note = f" · flink check skipped ({str(e)[:60]})"
    else:
        flink_note = " · flink not checked (no flink key)"

    running_flink = n_running or 0
    if n_conn > 0 or running_flink > 0:
        fl = f"{running_flink} flink stmt(s) running" if n_running is not None else "flink unchecked"
        return "fresh", f"serving · {n_conn} connector(s) + {fl} · checked {_utc_hhmm()}{flink_note}"
    return "warm", f"idle · 0 connectors · topics retained · checked {_utc_hhmm()}{flink_note}"


def main() -> int:
    try:
        status, reason = probe_state()
    except CheckError as exc:
        # Failed check: mark stale with the reason. NEVER claim a fresh state.
        status, reason = "stale", f"check_failed: {str(exc)[:200]} · last checked {_utc_hhmm()}"
    except Exception as exc:  # unexpected — still fail closed to stale
        status, reason = "stale", f"check_failed (unexpected): {str(exc)[:200]} · {_utc_hhmm()}"

    try:
        graph_bind.write_row(status, reason)
    except SystemExit:
        raise  # graph_bind.write_row exits non-zero if the DB is unreachable
    print(f"broker = {status} · {reason}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
