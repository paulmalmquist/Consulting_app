"""
Phase 2 driver — score the deterministic replay feed with the promoted champion anomaly model.
Writes novendor_1.telemetry.gold_replay_feed_scored. Prints determinism/agreement evidence.
"""
import json
import sys
from pathlib import Path

from _bootstrap import get_client
from _jobs import ensure_dir, upload_notebook, run_notebook_and_wait, get_notebook_output, WORKSPACE_DIR

NOTEBOOK = Path(__file__).resolve().parent / "notebooks" / "score_replay_feed.py"


def main() -> int:
    client = get_client()
    ensure_dir(client)
    wp = upload_notebook(client, str(NOTEBOOK), f"{WORKSPACE_DIR}/score_replay_feed")
    print(f"[replay-score] uploaded {wp}")
    res = run_notebook_and_wait(client, wp, "telemetry_score_replay_feed", timeout=1200)
    print(f"[replay-score] result_state={res['result_state']} life={res['life_cycle_state']}")
    print(f"[replay-score] run_page_url={res['run_page_url']}")
    if res["result_state"] != "SUCCESS":
        print(f"[replay-score] FAIL — {res.get('state_message')}")
        return 2
    out = get_notebook_output(client, res["run_id"])
    print("[replay-score] result:")
    print(json.dumps(json.loads(out.get("result", "{}")), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
