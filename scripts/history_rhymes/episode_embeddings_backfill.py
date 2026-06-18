#!/usr/bin/env python
"""C1 — gated episode_embeddings backfill (DRY-RUN BY DEFAULT; no writes).

Promotes vetted feature-store model observations into the live analog spine
(`episode_embeddings`) only behind every gate. This script defaults to a dry-run
that writes nothing and exits 0 with a structured receipt — even when blocked.

A write requires ALL of: --write AND --confirm AND --model-version AND a valid
--calibration-evidence file AND every gate passing (calibration, permutation,
no-lookahead, version bump, 256-dim, promotable source_quality, resolvable
episode mapping, append-only). Against the live DB the episode mapping is
unresolved by design (see embedding_backfill.DbBackfillRepository), so a real
write blocks and emits a C2 mapping proposal — never poisons the spine.

Usage:
    python scripts/history_rhymes/episode_embeddings_backfill.py --dry-run --limit 25 --json
    python scripts/history_rhymes/episode_embeddings_backfill.py \\
        --write --confirm --model-version hr_feature_store_v2 \\
        --calibration-evidence path/to/evidence.json --limit 25 --json
"""

from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))

from app.services.hr_feature_store.embedding_backfill import (  # noqa: E402
    DbBackfillRepository,
    execute_backfill,
    plan_backfill,
)


def _load_evidence(path: str | None) -> dict | None:
    if not path:
        return None
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as exc:  # noqa: BLE001 — a bad path must not crash; it blocks via missing evidence
        print(f"warning: could not read calibration evidence {path}: {exc}", file=sys.stderr)
        return None


def main() -> int:
    p = argparse.ArgumentParser(description="Gated episode_embeddings backfill (dry-run default)")
    p.add_argument("--dry-run", action="store_true", help="default; plan only, write nothing")
    p.add_argument("--write", action="store_true", help="required for any write path")
    p.add_argument("--confirm", action="store_true", help="required in addition to --write")
    p.add_argument("--model-version", default=None, help="new model_version (required for write)")
    p.add_argument("--calibration-evidence", default=None, help="path to calibration evidence JSON")
    p.add_argument("--limit", type=int, default=None, help="max candidate rows")
    p.add_argument("--json", action="store_true", help="emit the receipt as JSON")
    args = p.parse_args()

    repo = DbBackfillRepository()
    evidence = _load_evidence(args.calibration_evidence)

    receipt, full_inserts = plan_backfill(
        repo,
        requested_model_version=args.model_version,
        calibration_evidence=evidence,
        limit=args.limit,
    )

    result = execute_backfill(
        repo, receipt, full_inserts, write=args.write, confirm=args.confirm,
    )
    receipt["mode"] = "write" if result["write_performed"] else "dry_run"
    receipt["write_result"] = result

    if args.json:
        print(json.dumps(receipt, indent=2, default=str))
    else:
        print(f"status={receipt['status']} write_allowed={receipt['write_allowed']} "
              f"candidates={receipt['candidate_count']} eligible={receipt['eligible_count']} "
              f"blocked={receipt['blocked_reasons']} write_performed={result['write_performed']}")
    return 0  # blocked dry-run is a normal, exit-0 outcome


if __name__ == "__main__":
    raise SystemExit(main())
