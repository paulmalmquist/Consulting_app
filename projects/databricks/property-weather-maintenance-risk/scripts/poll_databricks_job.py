from __future__ import annotations

import argparse
import json
import subprocess
import time
from pathlib import Path


def _run_databricks(args: list[str]) -> dict:
    completed = subprocess.run(["databricks", *args], check=False, capture_output=True, text=True)
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or completed.stdout.strip())
    return json.loads(completed.stdout)


def main() -> int:
    parser = argparse.ArgumentParser(description="Poll a Databricks job run.")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--timeout-seconds", type=int, default=3600)
    parser.add_argument("--interval-seconds", type=int, default=30)
    parser.add_argument("--out", type=Path, default=Path("artifacts/happyco/weather-risk/databricks_poll_receipt.json"))
    args = parser.parse_args()

    deadline = time.time() + args.timeout_seconds
    last = {}
    while time.time() < deadline:
        last = _run_databricks(["jobs", "get-run", str(args.run_id), "--output", "json"])
        state = last.get("state", {})
        lifecycle = state.get("life_cycle_state")
        result = state.get("result_state")
        if lifecycle in {"TERMINATED", "SKIPPED", "INTERNAL_ERROR"}:
            args.out.parent.mkdir(parents=True, exist_ok=True)
            args.out.write_text(json.dumps(last, indent=2) + "\n", encoding="utf-8")
            print({"ok": result == "SUCCESS", "run_id": args.run_id, "state": state, "receipt": str(args.out)})
            return 0 if result == "SUCCESS" else 1
        time.sleep(args.interval_seconds)
    raise TimeoutError(f"Timed out polling Databricks run {args.run_id}. Last state: {last.get('state')}")


if __name__ == "__main__":
    raise SystemExit(main())
