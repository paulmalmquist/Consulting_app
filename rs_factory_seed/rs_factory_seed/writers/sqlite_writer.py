"""Deterministic SQLite writer. Tables created in sorted order, rows inserted in
natural-key order. `sqlite_dump` returns the textual `iterdump()` for determinism checks."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from ..dataset import Dataset, Table

_VIEWS_SQL = Path(__file__).resolve().parents[1] / "sql" / "create_views.sql"


def _coltype(table: Table, col: str) -> str:
    # Light typing for readable DDL; values are inserted as Python objects.
    for row in table.rows[:50]:
        v = row.get(col)
        if isinstance(v, bool):
            return "INTEGER"
        if isinstance(v, int):
            return "INTEGER"
        if isinstance(v, float):
            return "REAL"
    return "TEXT"


def _val(v):
    if isinstance(v, bool):
        return int(v)
    return v


def write_sqlite(ds: Dataset, db_path: Path) -> Path:
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()
    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.cursor()
        for name in ds.names():
            t = ds.get(name)
            cols_ddl = ", ".join(f'"{c}" {_coltype(t, c)}' for c in t.columns)
            cur.execute(f'CREATE TABLE "{name}" ({cols_ddl})')
            placeholders = ", ".join("?" for _ in t.columns)
            insert = f'INSERT INTO "{name}" VALUES ({placeholders})'
            cur.executemany(
                insert,
                [[_val(row.get(c)) for c in t.columns] for row in t.sorted_rows()],
            )
        cur.executescript(_VIEWS_SQL.read_text(encoding="utf-8"))
        conn.commit()
    finally:
        conn.close()
    return db_path


def sqlite_dump(db_path: Path) -> str:
    conn = sqlite3.connect(str(db_path))
    try:
        return "\n".join(conn.iterdump())
    finally:
        conn.close()
