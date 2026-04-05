#!/usr/bin/env python3
"""Print migration revision information.

Usage:
    python scripts/print_db_revision.py

Shows the latest migration file in code and checks whether key tables exist
in the database. The Node.js migration system (apply.js) does not maintain a
revision tracking table, so column/table existence is the best proxy for
migration state.
"""
import glob
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

SCHEMA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "repo-b", "db", "schema")


def get_code_head() -> str | None:
    pattern = os.path.join(SCHEMA_DIR, "*.sql")
    files = sorted(glob.glob(pattern))
    if not files:
        return None
    return os.path.basename(files[-1])


def check_table_exists(table_name: str) -> bool | None:
    """Return True/False if DB is reachable, None if not."""
    try:
        from app.db import get_cursor
        with get_cursor() as cur:
            cur.execute(
                "SELECT 1 FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_name = %s",
                (table_name,),
            )
            return cur.fetchone() is not None
    except Exception:
        return None


def main() -> int:
    print("=" * 60)
    print("Migration Revision Report")
    print("=" * 60)

    code_head = get_code_head()
    print(f"  Code head (latest .sql file): {code_head or 'NOT FOUND'}")
    print(f"  Schema directory:             {os.path.abspath(SCHEMA_DIR)}")
    print()
    print("  NOTE: This migration system (Node.js apply.js) does not")
    print("        track applied revisions in the database. All SQL files")
    print("        are applied idempotently in lexicographic order.")
    print()

    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        print("  DATABASE_URL not set - skipping DB checks.")
        print("=" * 60)
        return 0

    print("  Table existence checks (proxy for migration state):")
    tables = ["ai_conversations", "ai_messages", "re_model", "repe_fund", "repe_asset"]
    for table in tables:
        exists = check_table_exists(table)
        if exists is None:
            status = "DB ERROR"
        elif exists:
            status = "EXISTS"
        else:
            status = "MISSING"
        print(f"    {table:30s} {status}")

    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
