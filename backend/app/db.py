import atexit

import psycopg
import psycopg.rows
from contextlib import contextmanager
from psycopg_pool import ConnectionPool

from app.config import require_database_url

_pool: ConnectionPool | None = None


def _get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            require_database_url(),
            min_size=2,
            max_size=10,
            kwargs={"prepare_threshold": 5, "row_factory": psycopg.rows.dict_row},
        )
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
