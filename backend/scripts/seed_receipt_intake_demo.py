"""Seed the receipt intake demo fixtures into an env/business.

Usage:
    python backend/scripts/seed_receipt_intake_demo.py --env-id <env_uuid> --business-id <biz_uuid>

Each fixture is ingested via receipt_intake.ingest_file so the full pipeline
runs (hash → dedupe → parse → normalize → classify → ledger → review).
Receipts are plain-text fixtures; the extractor treats text/plain as an image
fallback, which still runs normalization on the body text.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

# Ensure the app module is importable when invoked from repo root.
REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services import receipt_intake, subscription_ledger  # noqa: E402


FIXTURE_PATH = BACKEND_ROOT / "app/fixtures/receipt_intake_demo/receipts.json"


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed receipt intake demo data.")
    parser.add_argument("--env-id", required=True)
    parser.add_argument("--business-id", required=True)
    args = parser.parse_args()

    fixtures = json.loads(FIXTURE_PATH.read_text())
    ingested: list[dict] = []
    for f in fixtures:
        body_bytes = (f["body"] or "").encode("utf-8")
        result = receipt_intake.ingest_file(
            env_id=args.env_id,
            business_id=args.business_id,
            file_bytes=body_bytes,
            filename=f["filename"],
            mime_type=f.get("mime_type", "text/plain"),
            source_type=f.get("source_type", "upload"),
            uploaded_by="seed",
        )
        ingested.append({"key": f["key"], **result})
        print(f"  ingested {f['key']}: {result}")

    # Force a recurring-scan pass so the price-change case fires its review item.
    detect = subscription_ledger.detect_recurring(
        env_id=args.env_id, business_id=args.business_id,
    )
    print(f"detect_recurring: {detect}")

    print(f"\nIngested {len(ingested)} fixtures. Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
