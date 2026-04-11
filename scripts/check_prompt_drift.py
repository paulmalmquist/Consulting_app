#!/usr/bin/env python3
"""Prompt drift alert script — Layer 5 regression check.

Compares ai_prompt_receipts between two (composer_version, strategy_version)
pairs and surfaces any metric that shifted more than the threshold. Designed
to run in CI (or on-demand) after a composer or strategy change lands. Fails
with a non-zero exit when drift exceeds the threshold.

Usage:
    DATABASE_URL=... python scripts/check_prompt_drift.py \
        --baseline-composer 2026-04-10-v0 --baseline-strategy 2026-04-10-v0 \
        --candidate-composer 2026-04-11-v1 --candidate-strategy 2026-04-11-v1 \
        --threshold 0.10

Metrics compared:
  * avg total_prompt_tokens
  * avg rag_share                (rag_tokens / total)
  * avg history_share            (history_tokens / total)
  * rate of each diagnostic flag in notes_json.flags
  * ratio of upstream/local prompt_tokens (measures tiktoken drift)

Exits:
  0 on success (or when either baseline/candidate has no receipts — nothing
    to compare yet, not a failure).
  1 when drift on any metric exceeds the threshold.
  2 on DB or CLI error.
"""
from __future__ import annotations

import argparse
import os
import sys
from typing import Any

try:
    import psycopg  # type: ignore
    from psycopg.rows import dict_row  # type: ignore
except Exception as exc:  # pragma: no cover
    print(f"psycopg required: {exc}", file=sys.stderr)
    sys.exit(2)


_METRIC_SQL = """
SELECT
    COUNT(*)                                                               AS turns,
    AVG(total_prompt_tokens)                                               AS avg_total,
    AVG(NULLIF(rag_tokens, 0)::float / NULLIF(total_prompt_tokens, 0))     AS avg_rag_share,
    AVG(NULLIF(history_tokens, 0)::float / NULLIF(total_prompt_tokens, 0)) AS avg_history_share,
    AVG(
        NULLIF(total_prompt_tokens_upstream, 0)::float
        / NULLIF(total_prompt_tokens, 0)
    )                                                                      AS upstream_over_local
FROM ai_prompt_receipts
WHERE composer_version = %s
  AND strategy_version = %s
  AND round_index = 0;
"""

_FLAG_SQL = """
SELECT flag, COUNT(*)::float / NULLIF(
    (
        SELECT COUNT(*) FROM ai_prompt_receipts
         WHERE composer_version = %s AND strategy_version = %s AND round_index = 0
    ), 0
) AS rate
FROM (
    SELECT jsonb_array_elements_text(COALESCE(notes_json->'flags', '[]'::jsonb)) AS flag
    FROM ai_prompt_receipts
    WHERE composer_version = %s AND strategy_version = %s AND round_index = 0
) AS f
GROUP BY flag
ORDER BY rate DESC;
"""


def _query_metrics(cur, composer_version: str, strategy_version: str) -> dict[str, Any]:
    cur.execute(_METRIC_SQL, (composer_version, strategy_version))
    row = cur.fetchone() or {}
    if not row.get("turns"):
        return {}
    return {
        "turns": int(row["turns"]),
        "avg_total": float(row["avg_total"] or 0.0),
        "avg_rag_share": float(row["avg_rag_share"] or 0.0),
        "avg_history_share": float(row["avg_history_share"] or 0.0),
        "upstream_over_local": float(row["upstream_over_local"] or 0.0),
    }


def _query_flag_rates(cur, composer_version: str, strategy_version: str) -> dict[str, float]:
    cur.execute(
        _FLAG_SQL,
        (composer_version, strategy_version, composer_version, strategy_version),
    )
    out: dict[str, float] = {}
    for row in cur.fetchall() or []:
        flag = row["flag"]
        out[flag] = float(row["rate"] or 0.0)
    return out


def _pct_delta(baseline: float, candidate: float) -> float:
    if baseline == 0:
        return float("inf") if candidate != 0 else 0.0
    return (candidate - baseline) / baseline


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--baseline-composer", required=True)
    parser.add_argument("--baseline-strategy", required=True)
    parser.add_argument("--candidate-composer", required=True)
    parser.add_argument("--candidate-strategy", required=True)
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.10,
        help="Drift threshold as a fraction (default 0.10 = 10%%).",
    )
    args = parser.parse_args()

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("DATABASE_URL is required", file=sys.stderr)
        return 2

    with psycopg.connect(dsn, row_factory=dict_row) as conn:  # type: ignore[call-arg]
        with conn.cursor() as cur:
            baseline = _query_metrics(cur, args.baseline_composer, args.baseline_strategy)
            candidate = _query_metrics(cur, args.candidate_composer, args.candidate_strategy)
            baseline_flags = _query_flag_rates(cur, args.baseline_composer, args.baseline_strategy)
            candidate_flags = _query_flag_rates(cur, args.candidate_composer, args.candidate_strategy)

    if not baseline or not candidate:
        print(
            f"insufficient data — baseline_turns={baseline.get('turns', 0)} "
            f"candidate_turns={candidate.get('turns', 0)}; nothing to compare."
        )
        return 0

    print("── Metric comparison ──")
    drift_flags: list[str] = []
    for key in ("avg_total", "avg_rag_share", "avg_history_share", "upstream_over_local"):
        b = baseline[key]
        c = candidate[key]
        delta = _pct_delta(b, c)
        marker = " !!!" if abs(delta) > args.threshold else ""
        print(f"  {key:24}  baseline={b:10.3f}  candidate={c:10.3f}  Δ={delta:+.2%}{marker}")
        if abs(delta) > args.threshold:
            drift_flags.append(key)

    print("── Flag-rate comparison ──")
    all_flags = sorted(set(baseline_flags) | set(candidate_flags))
    for flag in all_flags:
        b = baseline_flags.get(flag, 0.0)
        c = candidate_flags.get(flag, 0.0)
        delta = _pct_delta(b, c)
        marker = " !!!" if abs(delta) > args.threshold else ""
        print(f"  flag {flag:28}  baseline={b:.2%}  candidate={c:.2%}  Δ={delta:+.2%}{marker}")
        if abs(delta) > args.threshold:
            drift_flags.append(f"flag:{flag}")

    if drift_flags:
        print(
            f"\nFAIL: drift exceeded threshold {args.threshold:.0%} on: {', '.join(drift_flags)}",
            file=sys.stderr,
        )
        return 1

    print("\nOK: no drift exceeded threshold.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
