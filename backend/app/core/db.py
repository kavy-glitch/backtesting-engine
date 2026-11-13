"""MySQL access. All SQL elsewhere uses %s placeholders (parameterised queries)."""
from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

import pymysql
import pymysql.cursors
from fastapi import Depends

from app.core.config import Settings, get_settings


def connect(settings: Settings | None = None) -> pymysql.connections.Connection:
    s = settings or get_settings()
    return pymysql.connect(
        host=s.db_host, port=s.db_port, user=s.db_user, password=s.db_password, database=s.db_name,
        charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor, autocommit=False,
        init_command="SET time_zone = '+00:00'", connect_timeout=5,
    )


def get_db(settings: Settings = Depends(get_settings)) -> Iterator[pymysql.connections.Connection]:
    """FastAPI dependency: one connection per request, always closed."""
    conn = connect(settings)
    try:
        yield conn
    finally:
        conn.close()


@contextmanager
def transaction(conn: pymysql.connections.Connection) -> Iterator[pymysql.cursors.Cursor]:
    """ACID unit of work: commit if the block succeeds, roll everything back if it raises."""
    cur = conn.cursor()
    try:
        yield cur
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        cur.close()
