#!/usr/bin/env python3
"""Scheduled refresh of the Confluent broker cost-state row on the Telemetry
Mission Control PIPELINE panel.

Runs in CI (GitHub Actions, ~every 15 min) where the interactive `confluent` CLI
login is unavailable — auth is via a Confluent service-account API key passed as
env. Probes the REAL Confluent state, maps it to an honest cost state from
OBSERVED FACTS ONLY, and writes the broker row to tel_pipeline_status.

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

import json
import os
import subprocess
import sys
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
REJECT_MARKERS = ("Bad Request", "Violations", "is not one of", "Error:", "Unauthorized", "Forbidden")


class CheckError(Exception):
    """A probe failed in a way that means we cannot trust the observed state."""


def _utc_hhmm() -> str:
    return datetime.now(timezone.utc).strftime("%H:%MZ")


def _run(args: list[str]) -> str:
    """Run a confluent CLI command, returning stdout. Treats exit!=0 OR a rejection
    marker in output as a failure (the CLI can exit 0 while rejecting an argument)."""
    proc = subprocess.run(
        ["confluent", *args], capture_output=True, text=True, timeout=60
    )
    out = (proc.stdout or "") + (proc.stderr or "")
    if proc.returncode != 0 or any(m in out for m in REJECT_MARKERS):
        raise CheckError(f"`confluent {' '.join(args)}` failed: {out.strip()[:300]}")
    return proc.stdout


def _json(args: list[str]):
    """Run a CLI command expecting JSON; strip any leading notice line before the
    first '[' or '{' (e.g. flink statement list prints an endpoint notice)."""
    raw = _run(args)
    i = min(
        (raw.find(c) for c in "[{" if raw.find(c) != -1),
        default=-1,
    )
    if i < 0:
        raise CheckError(f"no JSON in output of `confluent {' '.join(args)}`")
    return json.loads(raw[i:])


def probe_state() -> tuple[str, str]:
    """Return (status, reason) from observed Confluent facts. Raises CheckError if
    the state cannot be observed (caller turns that into a 'stale' row)."""
    # Cluster existence
    try:
        _json(["kafka", "cluster", "describe", CLUSTER_ID, "--environment", ENV_ID, "-o", "json"])
        cluster_up = True
    except CheckError:
        cluster_up = False

    if not cluster_up:
        # Confirm pools are also gone before declaring the lane fully torn down.
        pools_present = False
        for p in FLINK_POOLS:
            try:
                _json(["flink", "compute-pool", "describe", p, "--environment", ENV_ID, "-o", "json"])
                pools_present = True
                break
            except CheckError:
                continue
        if pools_present:
            # Ambiguous: cluster unreachable but a pool answered — don't guess.
            raise CheckError("cluster not found but a Flink pool still responds — ambiguous, not claiming a state")
        return "gone", f"cluster + flink pools deleted · recreate from export · checked {_utc_hhmm()}"

    # Connectors
    connectors = _json(["connect", "cluster", "list", "--cluster", CLUSTER_ID,
                        "--environment", ENV_ID, "-o", "json"]) or []
    n_conn = len(connectors)

    # Running Flink statements
    statements = _json(["flink", "statement", "list", "--environment", ENV_ID,
                       "--cloud", FLINK_CLOUD, "--region", FLINK_REGION, "-o", "json"]) or []
    n_running = sum(1 for s in statements if s.get("status") in RUNNING_STATES)

    if n_conn > 0 or n_running > 0:
        return "fresh", f"serving · {n_conn} connector(s) + {n_running} flink stmt(s) running · checked {_utc_hhmm()}"
    return "warm", f"idle · 0 connectors · 0 running flink stmts · topics retained · checked {_utc_hhmm()}"


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
