"""Strategy catalogue and saved strategy configurations."""
from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Iterable, Optional

import pymysql

from app.core.db import transaction
from app.core.errors import ApiError, not_found
from app.repositories.common import to_json_value as _f, to_row as _row, to_rows as _rows


# ------------------------------------------------------------------- strategies
def sync_strategy_types(conn, catalog: list[dict]) -> None:
    """Make the DB catalogue mirror the engine's (the engine is the source of truth)."""
    with transaction(conn) as cur:
        for s in catalog:
            cur.execute(
                "INSERT INTO strategy_types (type_key, name, description) VALUES (%s, %s, %s) "
                "ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description)",
                (s["type"], s["name"], s["description"]))
            cur.execute("SELECT id FROM strategy_types WHERE type_key = %s", (s["type"],))
            type_id = cur.fetchone()["id"]
            cur.execute("DELETE FROM strategy_param_specs WHERE strategy_type_id = %s", (type_id,))
            if s["params"]:
                cur.executemany(
                    "INSERT INTO strategy_param_specs (strategy_type_id, param_key, label, default_value, min_value, max_value, is_integer) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                    [(type_id, p["key"], p["label"], p["default"], p["min"], p["max"], p["integer"]) for p in s["params"]])


def list_strategy_types(conn) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute("SELECT id, type_key, name, description FROM strategy_types ORDER BY id")
        types = cur.fetchall()
        cur.execute("SELECT strategy_type_id, param_key, label, default_value, min_value, max_value, is_integer "
                    "FROM strategy_param_specs ORDER BY strategy_type_id, param_key")
        specs = cur.fetchall()
    conn.commit()
    out = []
    for t in types:
        params = [{"key": s["param_key"], "label": s["label"], "default": s["default_value"],
                   "min": s["min_value"], "max": s["max_value"], "integer": bool(s["is_integer"])}
                  for s in specs if s["strategy_type_id"] == t["id"]]
        out.append({"id": t["id"], "type": t["type_key"], "name": t["name"], "description": t["description"], "params": params})
    return out


def get_strategy_type(conn, type_key: str) -> dict:
    with conn.cursor() as cur:
        cur.execute("SELECT id, type_key, name FROM strategy_types WHERE type_key = %s", (type_key,))
        r = cur.fetchone()
    conn.commit()
    if r is None:
        raise ApiError(422, "UNKNOWN_STRATEGY", f"Unknown strategy type '{type_key}'.")
    return r


def create_saved_strategy(conn, name: str, type_id: int, params: dict[str, float]) -> int:
    try:
        with transaction(conn) as cur:
            cur.execute("INSERT INTO saved_strategies (name, strategy_type_id) VALUES (%s, %s)", (name, type_id))
            sid = cur.lastrowid
            if params:
                cur.executemany("INSERT INTO saved_strategy_params (saved_strategy_id, param_key, param_value) VALUES (%s, %s, %s)",
                                [(sid, k, v) for k, v in params.items()])
    except pymysql.err.MySQLError as exc:
        if exc.args[0] == 1062:
            raise ApiError(409, "DUPLICATE", f"A saved strategy named '{name}' already exists.") from exc
        if exc.args[0] in (3819, 1048, 1406):
            raise ApiError(422, "INVALID_DATA", "Saved strategy violates a database constraint.") from exc
        raise
    return sid


def list_saved_strategies(conn) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute("SELECT s.id, s.name, s.created_at, t.type_key, t.name AS type_name "
                    "FROM saved_strategies s JOIN strategy_types t ON t.id = s.strategy_type_id ORDER BY s.name")
        rows = _rows(cur.fetchall())
        cur.execute("SELECT saved_strategy_id, param_key, param_value FROM saved_strategy_params")
        params = cur.fetchall()
    conn.commit()
    for r in rows:
        r["params"] = {p["param_key"]: p["param_value"] for p in params if p["saved_strategy_id"] == r["id"]}
        r["strategy_type"] = r.pop("type_key")
    return rows


def get_saved_strategy(conn, sid: int) -> dict:
    for r in list_saved_strategies(conn):
        if r["id"] == sid:
            return r
    raise not_found("Saved strategy")


def delete_saved_strategy(conn, sid: int) -> None:
    with transaction(conn) as cur:
        cur.execute("DELETE FROM saved_strategies WHERE id = %s", (sid,))
        if cur.rowcount == 0:
            raise not_found("Saved strategy")


