"""Phase C — failure-case library color (READ-ONLY)."""
from __future__ import annotations
import json, sys, time
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "databricks"))
from _bootstrap import get_client, TEL  # noqa: E402


def sql(c, s, timeout=120):
    r = c.execute_sql(s); sid = r.get("statement_id"); st = r.get("status", {}).get("state"); t0 = time.time()
    while st in ("PENDING", "RUNNING") and time.time() - t0 < timeout:
        time.sleep(2); r = c._request("GET", f"/api/2.0/sql/statements/{sid}"); st = r.get("status", {}).get("state")
    return r.get("result", {}).get("data_array", []) or []


c = get_client()
out = {}
# Anomaly replay feed: example false positives (label 0, model fired) with their score; confirm fn=0.
out["replay_false_positive_examples"] = sql(c, f"""
    SELECT t, ROUND(value,3), ROUND(value_rmean50,3), ROUND(anomaly_score,3)
    FROM {TEL}.gold_replay_feed_scored WHERE is_anomaly=0 AND model_pred=1
    ORDER BY anomaly_score DESC LIMIT 5""")
out["replay_false_negative_count"] = sql(c, f"SELECT COUNT(*) FROM {TEL}.gold_replay_feed_scored WHERE is_anomaly=1 AND model_pred=0")
out["replay_score_sep"] = sql(c, f"""
    SELECT is_anomaly, ROUND(AVG(anomaly_score),3), ROUND(MIN(anomaly_score),3), ROUND(MAX(anomaly_score),3)
    FROM {TEL}.gold_replay_feed_scored GROUP BY is_anomaly ORDER BY is_anomaly""")
# Clustering: noise exemplars + the two seal/fastener split clusters' exemplars
out["cluster_noise_examples"] = sql(c, f"""
    SELECT r.defect_family, r.workcell, r.summary FROM {TEL}.ncr_points p
    JOIN {TEL}.ncr_records r ON p.ncr_key=r.ncr_key WHERE p.cluster_id=-1 LIMIT 8""")
out["cluster_family_purity"] = sql(c, f"""
    SELECT p.cluster_id, r.defect_family, COUNT(*) AS n FROM {TEL}.ncr_points p
    JOIN {TEL}.ncr_records r ON p.ncr_key=r.ncr_key
    GROUP BY p.cluster_id, r.defect_family ORDER BY p.cluster_id, n DESC""")
(HERE / "phaseC_failure_cases.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
print(json.dumps(out, indent=2))
