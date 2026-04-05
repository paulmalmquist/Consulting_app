#!/usr/bin/env python3
"""Winston health monitor — runs smoke tests and tracks results over time.

Usage:
    python scripts/winston_health_monitor.py              # run once, store result
    python scripts/winston_health_monitor.py --report     # print trend report
    python scripts/winston_health_monitor.py --report -n 20  # last 20 results

Results stored in artifacts/production-loop/health-checks/
Each run produces a timestamped JSON file with full diagnostics.
"""
import argparse
import glob
import json
import os
import subprocess
import sys
import time

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SMOKE_SCRIPT = os.path.join(REPO_ROOT, "scripts", "smoke_companion_boot.py")
RESULTS_DIR = os.path.join(REPO_ROOT, "artifacts", "production-loop", "health-checks")


def run_smoke_test() -> dict:
    """Run the smoke test and capture its JSON output."""
    os.makedirs(RESULTS_DIR, exist_ok=True)
    ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())

    result = subprocess.run(
        [sys.executable, SMOKE_SCRIPT, "--json-only"],
        capture_output=True, text=True, timeout=300,
    )

    # Parse the JSON output (smoke test prints JSON to stdout)
    try:
        receipt = json.loads(result.stdout)
    except Exception:
        receipt = {
            "timestamp": ts,
            "result": "ERROR",
            "passed": False,
            "error": result.stderr[:1000] if result.stderr else "Failed to parse smoke test output",
            "stdout": result.stdout[:1000],
        }

    # Enrich with monitoring metadata
    receipt["monitor_ts"] = ts
    receipt["exit_code"] = result.returncode

    # Compute a compact summary
    steps = receipt.get("steps", {})
    prompts = steps.get("prompts", [])
    healthy = sum(1 for p in prompts if p.get("passed"))
    total = len(prompts)
    receipt["summary"] = {
        "readiness": steps.get("readiness", {}).get("status") == 200,
        "schema_ok": steps.get("winston_readiness", {}).get("data", {}).get("ok", False),
        "bootstrap_ok": steps.get("conversation_create", {}).get("status") == 200,
        "prompts_healthy": healthy,
        "prompts_total": total,
        "all_passed": receipt.get("passed", False),
    }

    # Add per-prompt diagnostics
    prompt_summaries = []
    for p in prompts:
        q = p.get("quality", {})
        prompt_summaries.append({
            "prompt": p.get("prompt", ""),
            "passed": p.get("passed", False),
            "status": q.get("status"),
            "degraded_reason": q.get("degraded_reason"),
            "skill_id": q.get("skill_id"),
            "lane": q.get("lane"),
            "elapsed_ms": p.get("elapsed_ms"),
        })
    receipt["summary"]["prompt_details"] = prompt_summaries

    # Write to file
    filename = f"{ts}.json"
    filepath = os.path.join(RESULTS_DIR, filename)
    with open(filepath, "w") as f:
        json.dump(receipt, f, indent=2)

    return receipt


def load_results(n: int = 50) -> list[dict]:
    """Load the most recent N results."""
    pattern = os.path.join(RESULTS_DIR, "*.json")
    files = sorted(glob.glob(pattern), reverse=True)[:n]
    results = []
    for f in files:
        try:
            with open(f) as fh:
                results.append(json.load(fh))
        except Exception:
            pass
    return list(reversed(results))  # chronological order


def print_report(n: int = 20):
    """Print a trend report of recent health checks."""
    results = load_results(n)
    if not results:
        print("No health check results found.")
        print(f"  Results dir: {RESULTS_DIR}")
        return

    print(f"Winston Health Monitor — Last {len(results)} checks")
    print("=" * 80)
    print(f"{'Timestamp':22s} {'Result':8s} {'Ready':6s} {'Schema':7s} {'Boot':5s} {'Prompts':10s} {'Details'}")
    print("-" * 80)

    for r in results:
        s = r.get("summary", {})
        ts = r.get("monitor_ts", r.get("timestamp", "?"))[:19]
        result = "PASS" if s.get("all_passed") else "FAIL"
        ready = "Y" if s.get("readiness") else "N"
        schema = "Y" if s.get("schema_ok") else "N"
        boot = "Y" if s.get("bootstrap_ok") else "N"
        healthy = s.get("prompts_healthy", 0)
        total = s.get("prompts_total", 0)
        prompts = f"{healthy}/{total}"

        # Collect failure reasons
        details = []
        for pd in s.get("prompt_details", []):
            if not pd.get("passed"):
                reason = pd.get("degraded_reason") or pd.get("status") or "?"
                details.append(f"{pd.get('prompt', '?')[:25]}→{reason}")

        detail_str = "; ".join(details) if details else ""
        print(f"{ts:22s} {result:8s} {ready:6s} {schema:7s} {boot:5s} {prompts:10s} {detail_str}")

    # Compute trend
    print("-" * 80)
    total_checks = len(results)
    passed = sum(1 for r in results if r.get("summary", {}).get("all_passed"))
    print(f"Pass rate: {passed}/{total_checks} ({100 * passed / total_checks:.0f}%)")

    # Check for regressions (was passing, now failing)
    if len(results) >= 2:
        prev = results[-2].get("summary", {}).get("all_passed")
        curr = results[-1].get("summary", {}).get("all_passed")
        if prev and not curr:
            print("  *** REGRESSION DETECTED — last check failed after a passing check ***")
        elif not prev and curr:
            print("  Recovery detected — last check passed after a failing check")


def main() -> int:
    parser = argparse.ArgumentParser(description="Winston health monitor")
    parser.add_argument("--report", action="store_true", help="Print trend report instead of running test")
    parser.add_argument("-n", type=int, default=20, help="Number of results to show in report")
    args = parser.parse_args()

    if args.report:
        print_report(args.n)
        return 0

    print("Running Winston smoke test...")
    receipt = run_smoke_test()
    s = receipt.get("summary", {})
    passed = s.get("all_passed", False)
    healthy = s.get("prompts_healthy", 0)
    total = s.get("prompts_total", 0)

    print(f"Result: {'PASS' if passed else 'FAIL'} — {healthy}/{total} prompts healthy")
    if not passed:
        for pd in s.get("prompt_details", []):
            if not pd.get("passed"):
                print(f"  FAIL: \"{pd['prompt']}\" → {pd.get('degraded_reason') or pd.get('status')}")

    filepath = os.path.join(RESULTS_DIR, f"{receipt['monitor_ts']}.json")
    print(f"Result saved: {filepath}")

    # Print mini-trend
    results = load_results(5)
    if len(results) > 1:
        recent_pass = sum(1 for r in results if r.get("summary", {}).get("all_passed"))
        print(f"Recent trend: {recent_pass}/{len(results)} passing")

    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
