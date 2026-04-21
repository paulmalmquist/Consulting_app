#!/usr/bin/env python3
"""Weekly History Rhymes brief generator — v1 thin wrapper.

v1 purpose: persist a weekly brief + signal snapshot to the DB when one is
produced (whether by manual prompt, LLM session, or future automated pipeline).

Usage:
    # Persist a brief + snapshot from a JSON bundle (file or stdin):
    python scripts/hr_weekly_brief.py --input brief_bundle.json
    cat brief_bundle.json | python scripts/hr_weekly_brief.py --input -

    # Seed a synthetic brief + snapshot (for smoke-testing the decision loop):
    python scripts/hr_weekly_brief.py --seed

Input JSON shape:
    {
      "brief": {
        "regime_call": "late_cycle",
        "confidence": 0.72,
        "freshness_score": 0.85,
        "markdown_uri": "docs/historyrhymes/briefs/2026-04-20.md",
        "parsed_json": { ... }      // themes, analogs, multi_agent_forecasts, honeypot_alerts, recommended_positions
      },
      "signals": {
        "mvrv_z": 1.4, "yc_10y2y": 0.3, "vix_term": 0.9, ...
        "per_signal_freshness": { ... }
      }
    }

Writes `docs/historyrhymes/briefs/YYYY-MM-DD.md` if `markdown_uri` is relative.
Always writes the DB rows.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def main() -> int:
    parser = argparse.ArgumentParser(description="Persist a weekly HR brief + signal snapshot.")
    parser.add_argument("--input", help="Path to brief bundle JSON file, or '-' for stdin.")
    parser.add_argument("--seed", action="store_true", help="Persist a synthetic seed brief + snapshot.")
    args = parser.parse_args()

    if not args.input and not args.seed:
        parser.error("Provide --input or --seed")

    repo_root = Path(__file__).resolve().parent.parent
    backend_dir = repo_root / "backend"
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    if args.seed:
        bundle = _seed_bundle()
    else:
        bundle = _load_bundle(args.input)

    brief_id, snapshot_id = _persist(bundle, repo_root)

    print(json.dumps({
        "brief_id": str(brief_id),
        "snapshot_id": str(snapshot_id),
        "regime_call": bundle["brief"].get("regime_call"),
        "markdown_written": bundle["brief"].get("markdown_uri"),
    }))
    return 0


def _load_bundle(source: str) -> dict[str, Any]:
    if source == "-":
        return json.load(sys.stdin)
    path = Path(source)
    return json.loads(path.read_text())


def _seed_bundle() -> dict[str, Any]:
    """Synthetic brief + snapshot sufficient to drive the decision loop end-to-end."""
    today = datetime.now(timezone.utc).date().isoformat()
    return {
        "brief": {
            "regime_call": "late_cycle",
            "confidence": 0.72,
            "freshness_score": 0.88,
            "markdown_uri": f"docs/historyrhymes/briefs/{today}.md",
            "parsed_json": {
                "themes": [
                    {"theme": "Yield curve inversion normalizing", "evidence": "10Y-2Y back to +30bps"},
                    {"theme": "CRE stress rising", "evidence": "CMBS delinquency +40bps QoQ"},
                ],
                "analogs": [
                    {
                        "episode_id": "2000-dot-com-peak",
                        "episode_name": "2000 Q1 dot-com peak",
                        "rhyme_score": 0.87,
                        "divergence_vector": {"vix_term": 0.4, "credit": -0.2},
                    }
                ],
                "multi_agent_forecasts": {
                    "macro":      {"direction": "down", "confidence": 0.6},
                    "quant":      {"direction": "down", "confidence": 0.65},
                    "narrative":  {"direction": "down", "confidence": 0.55},
                    "contrarian": {"direction": "up",   "confidence": 0.5},
                    "red_team":   {"direction": "down", "confidence": 0.7},
                },
                "honeypot_alerts": [
                    {"kind": "crowded-short-vol", "score": 0.62, "evidence": "VIX put/call skew extreme"}
                ],
                "crowding_score": 0.55,
                "recommended_positions": [
                    {
                        "asset": "SPY",
                        "direction": "short",
                        "size": 0.35,
                        "time_horizon_days": 30,
                        "entry_type": "staggered",
                        "key_drivers": ["regime=late_cycle", "multi-agent 4/5 agree down"],
                        "invalidation": "10Y-2Y re-inverts OR VIX term flips backwardated",
                        "next_check": "daily snapshot + weekly brief delta",
                    },
                    {
                        "asset": "GLD",
                        "direction": "long",
                        "size": 0.25,
                        "time_horizon_days": 90,
                        "entry_type": "immediate",
                        "key_drivers": ["credit stress rising", "Fed pivot probability increasing"],
                        "invalidation": "CMBS delinquency reverses 2 consecutive prints",
                        "next_check": "monthly CMBS release",
                    },
                ],
            },
            "source": "seed",
        },
        "signals": {
            "mvrv_z": 1.4,
            "yc_10y2y": -0.10,   # inverted
            "vix_term": 0.95,
            "housing": {"price_yoy": -2.1, "starts_yoy": -15.0},
            "cmbs_delinq": 0.062,
            "fed_tone": "hawkish-hold",
            "crypto_flow": -0.8,
            "macro_surprise": -0.45,
            "per_signal_freshness": {
                "mvrv_z": "fresh",
                "yc_10y2y": "fresh",
                "vix_term": "fresh",
                "housing": "1d",
                "cmbs_delinq": "7d",
                "fed_tone": "fresh",
                "crypto_flow": "fresh",
                "macro_surprise": "1d",
            },
            "source": "seed",
        },
    }


def _persist(bundle: dict[str, Any], repo_root: Path) -> tuple[str, str]:
    from app.db import get_cursor

    brief = bundle["brief"]
    signals = bundle["signals"]

    # Write markdown to disk if markdown_uri is relative and no file exists
    markdown_uri = brief.get("markdown_uri")
    if markdown_uri and not markdown_uri.startswith(("http://", "https://", "s3://")):
        md_path = repo_root / markdown_uri
        md_path.parent.mkdir(parents=True, exist_ok=True)
        if not md_path.exists():
            md_path.write_text(_render_markdown(brief))

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO hr_weekly_briefs (
                regime_call, confidence, freshness_score, markdown_uri, parsed_json, source
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING brief_id;
            """,
            (
                brief.get("regime_call"),
                brief.get("confidence"),
                brief.get("freshness_score"),
                brief.get("markdown_uri"),
                json.dumps(brief.get("parsed_json") or {}),
                brief.get("source", "manual"),
            ),
        )
        brief_id = cur.fetchone()["brief_id"]

        cur.execute(
            """
            INSERT INTO hr_signal_snapshots (signals_json, source)
            VALUES (%s, %s)
            RETURNING snapshot_id;
            """,
            (
                json.dumps(signals),
                signals.get("source", "scheduled"),
            ),
        )
        snapshot_id = cur.fetchone()["snapshot_id"]

    return brief_id, snapshot_id


def _render_markdown(brief: dict[str, Any]) -> str:
    """Minimal markdown archive. v2 may produce richer narrative prose."""
    parsed = brief.get("parsed_json", {}) or {}
    themes = "\n".join(f"- **{t.get('theme')}** — {t.get('evidence')}" for t in parsed.get("themes", []) or [])
    analogs = "\n".join(
        f"- {a.get('episode_name')} (rhyme {a.get('rhyme_score')})"
        for a in parsed.get("analogs", []) or []
    )
    today = datetime.now(timezone.utc).date().isoformat()
    return f"""# HR Weekly Brief — {today}

**Regime call:** {brief.get('regime_call')}
**Confidence:** {brief.get('confidence')}
**Freshness score:** {brief.get('freshness_score')}

## Themes
{themes or '_none_'}

## Analogs
{analogs or '_none_'}

## Source
{brief.get('source', 'manual')}
"""


if __name__ == "__main__":
    raise SystemExit(main())
