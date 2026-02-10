import psycopg
from contextlib import contextmanager
from app.config import require_database_url


def get_connection() -> psycopg.Connection:
    return psycopg.connect(require_database_url())


@contextmanager
def get_cursor():
    conn = get_connection()
    try:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            yield cur
            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
