"""Instruments, candles and import batches (all SQL parameterised)."""
from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Iterable, Optional

import pymysql

from app.core.db import transaction
from app.core.errors import ApiError, not_found
from app.repositories.common import to_json_value as _f, to_row as _row, to_rows as _rows


# ------------------------------------------------------------------ instruments
_INSTRUMENT_SELECT = """
SELECT i.id, i.symbol, i.name, i.exchange, i.currency, i.asset_class, i.is_synthetic, i.created_at,
       c.first_date, c.last_date, COALESCE(c.candle_count, 0) AS candle_count
  FROM instruments i
  LEFT JOIN (SELECT instrument_id, MIN(trade_date) AS first_date, MAX(trade_date) AS last_date,
                    COUNT(*) AS candle_count
               FROM candles WHERE timeframe = '1d' GROUP BY instrument_id) c ON c.instrument_id = i.id
"""


def list_instruments(conn) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(_INSTRUMENT_SELECT + " ORDER BY i.symbol")
        out = _rows(cur.fetchall())
    conn.commit()
    for r in out:
        r["is_synthetic"] = bool(r["is_synthetic"])
    return out


def get_instrument(conn, instrument_id: int) -> dict:
    with conn.cursor() as cur:
        cur.execute(_INSTRUMENT_SELECT + " WHERE i.id = %s", (instrument_id,))
        r = _row(cur.fetchone())
    conn.commit()
    if r is None:
        raise not_found("Instrument")
    r["is_synthetic"] = bool(r["is_synthetic"])
    return r


def find_instrument_by_symbol(conn, symbol: str) -> Optional[dict]:
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM instruments WHERE symbol = %s", (symbol,))
        r = cur.fetchone()
    conn.commit()
    return get_instrument(conn, r["id"]) if r else None


def create_instrument(conn, *, symbol: str, name: Optional[str], exchange: Optional[str], currency: str,
                      asset_class: str, is_synthetic: bool = False) -> dict:
    try:
        with transaction(conn) as cur:
            cur.execute(
                "INSERT INTO instruments (symbol, name, exchange, currency, asset_class, is_synthetic) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                (symbol, name, exchange, currency, asset_class, is_synthetic),
            )
            new_id = cur.lastrowid
    except pymysql.err.MySQLError as exc:
        if exc.args[0] == 1062:
            raise ApiError(409, "DUPLICATE", f"Instrument '{symbol}' already exists.") from exc
        if exc.args[0] in (3819, 1048, 1406):
            raise ApiError(422, "INVALID_DATA", "Instrument data violates a database constraint.") from exc
        raise
    return get_instrument(conn, new_id)


def delete_instrument(conn, instrument_id: int) -> None:
    try:
        with transaction(conn) as cur:
            cur.execute("DELETE FROM instruments WHERE id = %s", (instrument_id,))
            if cur.rowcount == 0:
                raise not_found("Instrument")
    except pymysql.err.IntegrityError as exc:
        if exc.args[0] in (1217, 1451):  # FK RESTRICT from backtest_runs (MySQL reports either code)
            raise ApiError(409, "IN_USE", "This instrument has saved backtests. Delete those first.") from exc
        raise


# ---------------------------------------------------------------------- candles
def import_candles(conn, instrument_id: int, candles: list[dict], *, source: str,
                   file_name: Optional[str], mode: str) -> dict:
    """Insert validated candles in ONE transaction. mode='skip' keeps existing rows,
    mode='replace' overwrites them. Returns counts."""
    lo, hi = candles[0]["date"], candles[-1]["date"]
    try:
        with transaction(conn) as cur:
            cur.execute(
                "SELECT trade_date FROM candles WHERE instrument_id = %s AND timeframe = '1d' "
                "AND trade_date BETWEEN %s AND %s", (instrument_id, lo, hi))
            existing = {r["trade_date"] for r in cur.fetchall()}
            to_write = [c for c in candles if mode == "replace" or c["date"] not in existing]
            inserted = sum(1 for c in to_write if c["date"] not in existing)
            updated = len(to_write) - inserted
            cur.execute(
                "INSERT INTO import_batches (instrument_id, source, file_name, rows_received, rows_inserted, rows_updated) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                (instrument_id, source, file_name, len(candles), inserted, updated))
            batch_id = cur.lastrowid
            if to_write:
                cur.executemany(
                    "INSERT INTO candles (instrument_id, timeframe, trade_date, open, high, low, close, volume, batch_id) "
                    "VALUES (%s, '1d', %s, %s, %s, %s, %s, %s, %s) "
                    "ON DUPLICATE KEY UPDATE open = VALUES(open), high = VALUES(high), low = VALUES(low), "
                    "close = VALUES(close), volume = VALUES(volume), batch_id = VALUES(batch_id)",
                    [(instrument_id, c["date"], c["open"], c["high"], c["low"], c["close"], c["volume"], batch_id)
                     for c in to_write])
    except pymysql.err.MySQLError as exc:
        if exc.args[0] == 1644:  # SIGNAL from trigger trg_candles_bi
            raise ApiError(422, "INVALID_DATA", f"Rejected by database rule: {exc.args[1]}") from exc
        if exc.args[0] in (3819, 1048, 1264, 1406):  # CHECK / NOT NULL / out of range
            raise ApiError(422, "INVALID_DATA", "Candle data violates a database constraint.") from exc
        raise
    return {"batch_id": batch_id, "rows_received": len(candles), "rows_inserted": inserted,
            "rows_updated": updated, "rows_skipped": len(candles) - len(to_write),
            "first_date": lo.isoformat(), "last_date": hi.isoformat()}


def get_candles(conn, instrument_id: int, start: Optional[date], end: Optional[date],
                limit: Optional[int] = None) -> list[dict]:
    sql = ("SELECT trade_date, open, high, low, close, volume FROM candles "
           "WHERE instrument_id = %s AND timeframe = '1d'")
    args: list[Any] = [instrument_id]
    if start:
        sql += " AND trade_date >= %s"; args.append(start)
    if end:
        sql += " AND trade_date <= %s"; args.append(end)
    sql += " ORDER BY trade_date"
    if limit:
        sql += " LIMIT %s"; args.append(limit)
    with conn.cursor() as cur:
        cur.execute(sql, args)
        rows = cur.fetchall()
    conn.commit()
    return [{"date": r["trade_date"].isoformat(), "open": float(r["open"]), "high": float(r["high"]),
             "low": float(r["low"]), "close": float(r["close"]), "volume": float(r["volume"])} for r in rows]


def count_candles(conn, instrument_id: int, start: Optional[date], end: Optional[date]) -> int:
    sql = "SELECT COUNT(*) AS n FROM candles WHERE instrument_id = %s AND timeframe = '1d'"
    args: list[Any] = [instrument_id]
    if start:
        sql += " AND trade_date >= %s"; args.append(start)
    if end:
        sql += " AND trade_date <= %s"; args.append(end)
    with conn.cursor() as cur:
        cur.execute(sql, args)
        n = cur.fetchone()["n"]
    conn.commit()
    return int(n)


def list_import_batches(conn, instrument_id: int, limit: int = 20) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute("SELECT id, source, file_name, rows_received, rows_inserted, rows_updated, created_at "
                    "FROM import_batches WHERE instrument_id = %s ORDER BY id DESC LIMIT %s", (instrument_id, limit))
        out = _rows(cur.fetchall())
    conn.commit()
    return out


