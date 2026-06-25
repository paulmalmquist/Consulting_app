#!/usr/bin/env python3
"""Regression tests for refresh_broker_row.py — the honest-state + fail-closed contract.

Framework-free (stdlib only): monkeypatches the Confluent probe and the DB writer,
asserts the (status, reason) the job would persist. Run:
    python skills/confluent-stargate-lifecycle/scripts/test_refresh_broker_row.py

Guards:
  - failed check  -> 'stale' + 'check_failed', NEVER a fresh-looking status
  - ambiguous probe -> 'stale', not a guessed state
  - observed running serving -> 'fresh'
  - observed idle -> 'warm'
  - observed teardown -> 'gone'
  - reason always carries a 'checked' timestamp
"""
import os
import sys

# Windows consoles default to cp1252; force UTF-8 so the · / — in reason strings print.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import graph_bind  # noqa: E402
import refresh_broker_row as r  # noqa: E402

fails = 0


def check(name, cond):
    global fails
    print(("  PASS  " if cond else "  FAIL  ") + name)
    if not cond:
        fails += 1


# Capture what would be written instead of hitting the DB.
written = {}
def _fake_write(status, reason):
    written["status"] = status
    written["reason"] = reason
graph_bind.write_row = _fake_write
r.graph_bind.write_row = _fake_write


_real_probe_state = r.probe_state  # save before tests 1–6 monkeypatch it

def run_with_probe(probe):
    written.clear()
    r.probe_state = probe
    r.main()
    return written["status"], written["reason"]


print("refresh_broker_row — honest-state + fail-closed regression tests")

# 1. Failed check must NOT overwrite as fresh — must be 'stale' + 'check_failed'.
def probe_raises():
    raise r.CheckError("confluent kafka cluster describe failed: Unauthorized")
status, reason = run_with_probe(probe_raises)
check("failed check -> status 'stale'", status == "stale")
check("failed check -> reason mentions check_failed", "check_failed" in reason)
check("failed check -> NEVER fresh/warm/hot", status not in ("fresh", "warm", "hot"))

# 2. Unexpected (non-CheckError) exception also fails closed to 'stale'.
def probe_explodes():
    raise ValueError("boom")
status, reason = run_with_probe(probe_explodes)
check("unexpected error -> status 'stale'", status == "stale")
check("unexpected error -> still not fresh", status != "fresh")

# 3. Observed serving -> 'fresh'.
status, reason = run_with_probe(lambda: ("fresh", "serving · 1 connector(s) + 0 flink stmt(s) running · checked 14:05Z"))
check("observed serving -> 'fresh'", status == "fresh")
check("fresh reason carries 'checked' timestamp", "checked" in reason)

# 4. Observed idle -> 'warm'.
status, reason = run_with_probe(lambda: ("warm", "idle · 0 connectors · 0 running flink stmts · topics retained · checked 14:05Z"))
check("observed idle -> 'warm'", status == "warm")

# 5. Observed teardown -> 'gone'.
status, reason = run_with_probe(lambda: ("gone", "cluster + flink pools deleted · recreate from export · checked 14:05Z"))
check("observed teardown -> 'gone'", status == "gone")

# 6. 'stale' is an accepted status for the DB writer (won't be rejected).
check("graph_bind accepts 'stale' as a valid status", "stale" in graph_bind.VALID)

# 7. REAL probe_state classification over the REST probe (the false-'gone' regression):
#    auth/network failure (403/401/timeout) must NOT be read as 'gone' — it's ambiguous → stale.
#    Only a genuine 404 on the CLUSTER yields 'gone'.
os.environ["CONFLUENT_CLOUD_API_KEY"] = "k"
os.environ["CONFLUENT_CLOUD_API_SECRET"] = "s"
os.environ.pop("CONFLUENT_FLINK_API_KEY", None)  # force "flink not checked" path

_orig_get = r._get

def _set_get(fn):
    r._get = fn  # probe_state calls module-level _get

def _reset_get():
    r._get = _orig_get

# 7a. cluster describe returns 403 (auth) → CheckError → caller writes 'stale', NOT 'gone'.
def _get_403(url, key, secret):
    raise r.CheckError(f"GET {url} -> HTTP 403 forbidden")
_set_get(_get_403)
try:
    st, _ = _real_probe_state()
    outcome = ("returned", st)
except r.CheckError:
    outcome = ("raised", "CheckError")
finally:
    _reset_get()
check("auth (403) failure is NOT classified 'gone'", outcome != ("returned", "gone"))
check("auth (403) failure raises CheckError (caller -> stale)", outcome == ("raised", "CheckError"))

# 7b. cluster describe 404 → 'gone'.
def _get_cluster_404(url, key, secret):
    if "/cmk/v2/clusters/" in url:
        raise r.NotFoundError(f"GET {url} -> 404 not found")
    return []
_set_get(_get_cluster_404)
try:
    st, _ = _real_probe_state()
    outcome2 = st
except r.CheckError:
    outcome2 = "raised-checkerror"
finally:
    _reset_get()
check("genuine cluster 404 -> 'gone'", outcome2 == "gone")

# 7c. cluster OK + 0 connectors + no flink key → 'warm' with a 'flink not checked' note.
def _get_idle(url, key, secret):
    if "/cmk/v2/clusters/" in url:
        return {"id": "lkc-x", "status": {"phase": "PROVISIONED"}}
    if "/connectors" in url:
        return []
    raise r.CheckError("unexpected url")
_set_get(_get_idle)
try:
    st, rs = _real_probe_state()
    outcome3 = (st, "flink not checked" in rs)
except r.CheckError:
    outcome3 = ("raised", False)
finally:
    _reset_get()
check("cluster up + 0 connectors + no flink key -> 'warm'", outcome3[0] == "warm")
check("warm reason notes flink was not checked", outcome3[1] is True)

print("")
if fails:
    print(f"{fails} test(s) FAILED")
    sys.exit(1)
print("All tests passed")
