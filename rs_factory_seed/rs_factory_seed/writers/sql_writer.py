"""Emit the generated SQLite DDL plus packaged views and guided queries."""

from __future__ import annotations

import sqlite3
from pathlib import Path

_SQL_DIR = Path(__file__).resolve().parents[1] / "sql"


def write_sql_artifacts(db_path: Path, out_dir: Path) -> list[Path]:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    try:
        rows = conn.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL ORDER BY name"
        ).fetchall()
    finally:
        conn.close()
    create_tables = out_dir / "create_tables.sql"
    create_tables.write_text(
        "\n\n".join(f"{sql};" for (sql,) in rows) + "\n",
        encoding="utf-8",
    )
    written = [create_tables]
    for name in ("create_views.sql", "sample_queries.sql"):
        destination = out_dir / name
        destination.write_bytes((_SQL_DIR / name).read_bytes())
        written.append(destination)
    return written
