"""Create/refresh the schema and synchronise the strategy catalogue.

    python -m scripts.init_db            # apply database/schema.sql (idempotent)

Uses the PBE_DB_* environment variables. The account needs DDL rights (e.g. root); the day-to-day
API account does not (and must not) have them."""
from __future__ import annotations

from pathlib import Path

from app import repositories as repo
from app.core.config import get_settings
from app.core.db import connect
from app.core.db_init import apply_schema
from app.integrations.engine_client import EngineClient

SCHEMA = Path(__file__).resolve().parents[2] / "database" / "schema.sql"


def main() -> None:
    s = get_settings()
    conn = connect(s)
    n = apply_schema(conn, SCHEMA)
    print(f"applied {n} statements from {SCHEMA.name} to database '{s.db_name}'")
    catalog = EngineClient(s.engine_path, s.engine_timeout_seconds).list_strategies()
    repo.sync_strategy_types(conn, catalog)
    print(f"strategy catalogue synchronised ({len(catalog)} strategies)")
    conn.close()


if __name__ == "__main__":
    main()
