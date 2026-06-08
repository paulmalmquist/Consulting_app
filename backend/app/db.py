import atexit

import psycopg
import psycopg.rows
from contextlib import contextmanager
from psycopg_pool import ConnectionPool

from app.config import require_database_url, DB_PREPARE_THRESHOLD
from app.db_conninfo import prefer_ipv4_hostaddr

_pool: ConnectionPool | None = None


def _get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        # Ticket 7B: max_size raised 10→20, timeout 5→10 as defense-in-depth
        # headroom. Verified safe — Supabase Postgres max_connections=60
        # (3 reserved, ~16 baseline in use), so 20 pool connections leave
        # ample margin. NOTE: this is margin, not the fix — the real fix is
        # scoping cursors per unit of work (see execution_auto.run_auto_generation)
        # so a long multi-step run does not pin one connection for its whole span.
        _pool = ConnectionPool(
            prefer_ipv4_hostaddr(require_database_url()),
            min_size=2,
            max_size=20,
            open=False,
            timeout=10,
            kwargs={
                "prepare_threshold": DB_PREPARE_THRESHOLD,
                "row_factory": psycopg.rows.dict_row,
                "connect_timeout": 5,
            },
        )
        _pool.open(wait=True, timeout=5)
        atexit.register(_pool.close)
    return _pool


def get_connection() -> psycopg.Connection:
    """Return a connection from the pool.

    Caller is responsible for closing (which returns it to the pool).
    Prefer get_cursor() for auto-managed lifecycle.
    """
    return _get_pool().getconn()


@contextmanager
def get_cursor():
    with _get_pool().connection() as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            yield cur
            conn.commit()
