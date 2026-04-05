#!/usr/bin/env python3
"""Validate Winston schema contract against the configured database.

Usage:
    python scripts/check_winston_schema.py

Requires DATABASE_URL to be set. Exits 0 if schema contract passes, 1 if not.
"""
import sys
import os

# Ensure backend app is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.winston_readiness import get_winston_readiness


def main() -> int:
    try:
        result = get_winston_readiness()
    except Exception as exc:
        print(f"FATAL: Could not run schema contract check: {exc}", file=sys.stderr)
        return 1

    print("=" * 60)
    print("Winston Schema Contract Check")
    print("=" * 60)
    print(f"  Enabled (AI_GATEWAY_ENABLED): {result.enabled}")
    print(f"  Schema version marker:        {result.schema_version_marker}")
    print(f"  Required columns:             {', '.join(result.required_columns)}")
    print(f"  Required indexes:             {', '.join(result.required_indexes)}")
    print(f"  Launch surfaces:              {', '.join(result.supported_launch_surface_ids)}")
    print()

    if result.missing_columns:
        print(f"  MISSING COLUMNS: {', '.join(result.missing_columns)}")
    if result.missing_indexes:
        print(f"  MISSING INDEXES: {', '.join(result.missing_indexes)}")
    if result.issues:
        print()
        print("  Issues:")
        for issue in result.issues:
            print(f"    - {issue}")

    # Schema contract check cares about schema validity, not gateway enablement.
    # AI_GATEWAY_ENABLED=false is expected in CI (no OpenAI key). The schema is
    # still valid if no columns/indexes are missing and no issues were found.
    schema_ok = not result.missing_columns and not result.missing_indexes and not result.issues

    print()
    if schema_ok:
        if not result.enabled:
            print("  Result: PASS (schema valid; AI gateway disabled — expected in CI)")
        else:
            print("  Result: PASS")
        print("=" * 60)
        return 0
    else:
        print("  Result: FAIL")
        print("=" * 60)
        return 1


if __name__ == "__main__":
    sys.exit(main())
