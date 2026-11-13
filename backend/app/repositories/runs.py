"""Saved backtests: atomic save, load, list, delete, trades."""
from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Iterable, Optional

import pymysql

from app.core.db import transaction
from app.core.errors import ApiError, not_found
from app.repositories.common import to_json_value as _f, to_row as _row, to_rows as _rows


# ------------------------------------------------------------------ backtest runs
_METRIC_COLS = ["final_equity", "net_profit", "total_return_pct", "realized_pnl", "unrealized_pnl", "total_fees",
                "max_drawdown_pct", "exposure_pct", "closed_trades", "winning_trades", "losing_trades",
                "breakeven_trades", "win_rate_pct", "avg_trade_return_pct", "avg_win", "avg_loss", "profit_factor",
                "sharpe_ratio", "sortino_ratio", "annual_volatility_pct", "cagr_pct", "buy_hold_return_pct",
                "buy_hold_final_equity"]


def save_run(conn, *, name: Optional[str], instrument_id: int, strategy_type_id: int,
             saved_strategy_id: Optional[int], start: str, end: str, cfg: dict, engine_version: str,
             strategy_params: dict[str, float], result: dict) -> int:
    """Persist a whole backtest atomically: either every table gets its rows or none does."""
    metrics = result["metrics"]
    trades = list(result["trades"])
    if result.get("open_trade"):
        ot = dict(result["open_trade"]); ot["id"] = len(trades) + 1
        trades.append(ot)
    dates = [p["date"] for p in result["equity"]]
    with transaction(conn) as cur:
        cur.execute(
            "INSERT INTO backtest_runs (name, instrument_id, strategy_type_id, saved_strategy_id, start_date, end_date, "
            "initial_capital, sizing_mode, sizing_value, fee_pct, fee_flat, slippage_bps, stop_loss_pct, take_profit_pct, "
            "risk_free_rate, allow_fractional, engine_version) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (name, instrument_id, strategy_type_id, saved_strategy_id, start, end, cfg["initial_capital"],
             cfg["position_sizing"]["mode"], cfg["position_sizing"]["value"], cfg["fee_pct"], cfg["fee_flat"],
             cfg["slippage_bps"], cfg["stop_loss_pct"], cfg["take_profit_pct"], cfg["risk_free_rate"],
             cfg["allow_fractional"], engine_version))
        run_id = cur.lastrowid
        if strategy_params:
            cur.executemany("INSERT INTO backtest_run_params (run_id, param_key, param_value) VALUES (%s,%s,%s)",
                            [(run_id, k, v) for k, v in strategy_params.items()])
        cur.execute(
            f"INSERT INTO backtest_metrics (run_id, {', '.join(_METRIC_COLS)}, notes) VALUES (%s, {', '.join(['%s'] * len(_METRIC_COLS))}, %s)",
            [run_id, *[metrics[c] for c in _METRIC_COLS], json.dumps(metrics.get("notes", {}))])
        if trades:
            cur.executemany(
                "INSERT INTO trades (run_id, trade_no, direction, status, entry_date, exit_date, entry_price, exit_price, "
                "quantity, entry_fee, exit_fee, gross_pnl, net_pnl, return_pct, holding_days, exit_reason) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                [(run_id, t["id"], t["direction"], t["status"], t["entry_date"], t["exit_date"], t["entry_price"],
                  t["exit_price"], t["quantity"], t["entry_fee"], t["exit_fee"], t["gross_pnl"], t["net_pnl"],
                  t["return_pct"], t["holding_days"], t["exit_reason"]) for t in trades])
        cur.executemany(
            "INSERT INTO equity_points (run_id, point_date, equity, cash, position_value, drawdown_pct, benchmark_equity) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s)",
            [(run_id, e["date"], e["equity"], e["cash"], e["position_value"], min(e["drawdown_pct"], 0.0),
              result["benchmark"][i]["equity"]) for i, e in enumerate(result["equity"])])
        for ind in result["indicators"]:
            cur.execute("INSERT INTO indicator_series (run_id, name, panel) VALUES (%s,%s,%s)", (run_id, ind["name"], ind["panel"]))
            series_id = cur.lastrowid
            pts = [(series_id, dates[i], v) for i, v in enumerate(ind["values"]) if v is not None]
            if pts:
                cur.executemany("INSERT INTO indicator_values (series_id, point_date, value) VALUES (%s,%s,%s)", pts)
        msgs = [(run_id, "warning", w[:500]) for w in result["warnings"]]
        msgs += [(run_id, "rejected_order", f"{o['date']} {o['side']}: {o['reason']}"[:500]) for o in result["rejected_orders"]]
        if msgs:
            cur.executemany("INSERT INTO run_messages (run_id, kind, message) VALUES (%s,%s,%s)", msgs)
    return run_id


def load_run(conn, run_id: int) -> dict:
    """Raw pieces of a saved run; services.build_run_response turns them into the API shape."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT r.*, i.symbol, i.name AS instrument_name, i.currency, i.is_synthetic, t.type_key, t.name AS strategy_name "
            "FROM backtest_runs r JOIN instruments i ON i.id = r.instrument_id "
            "JOIN strategy_types t ON t.id = r.strategy_type_id WHERE r.id = %s", (run_id,))
        run = _row(cur.fetchone())
        if run is None:
            conn.commit()
            raise not_found("Backtest")
        cur.execute("SELECT param_key, param_value FROM backtest_run_params WHERE run_id = %s", (run_id,))
        params = {r["param_key"]: r["param_value"] for r in cur.fetchall()}
        cur.execute("SELECT * FROM backtest_metrics WHERE run_id = %s", (run_id,))
        metrics = cur.fetchone()
        cur.execute("SELECT trade_no, direction, status, entry_date, exit_date, entry_price, exit_price, quantity, entry_fee, "
                    "exit_fee, gross_pnl, net_pnl, return_pct, holding_days, exit_reason FROM trades "
                    "WHERE run_id = %s ORDER BY trade_no", (run_id,))
        trades = _rows(cur.fetchall())
        cur.execute("SELECT point_date AS date, equity, cash, position_value, drawdown_pct, benchmark_equity "
                    "FROM equity_points WHERE run_id = %s ORDER BY point_date", (run_id,))
        equity = _rows(cur.fetchall())
        cur.execute("SELECT s.name, s.panel, v.point_date AS date, v.value FROM indicator_series s "
                    "JOIN indicator_values v ON v.series_id = s.id WHERE s.run_id = %s ORDER BY s.id, v.point_date", (run_id,))
        ind_rows = _rows(cur.fetchall())
        cur.execute("SELECT kind, message FROM run_messages WHERE run_id = %s ORDER BY id", (run_id,))
        messages = cur.fetchall()
    conn.commit()
    metrics["notes"] = json.loads(metrics["notes"]) if isinstance(metrics["notes"], str) else metrics["notes"]
    metrics.pop("run_id", None)
    indicators: dict[str, dict] = {}
    for r in ind_rows:
        indicators.setdefault(r["name"], {"name": r["name"], "panel": r["panel"], "points": []})["points"].append(
            {"date": r["date"], "value": r["value"]})
    run["is_synthetic"] = bool(run["is_synthetic"])
    run["allow_fractional"] = bool(run["allow_fractional"])
    return {"run": run, "params": params, "metrics": metrics, "trades": trades, "equity": equity,
            "indicators": list(indicators.values()), "messages": messages}


_RUN_SORT = {"created_at": "created_at", "total_return_pct": "total_return_pct", "max_drawdown_pct": "max_drawdown_pct",
             "sharpe_ratio": "sharpe_ratio", "net_profit": "net_profit", "closed_trades": "closed_trades"}


def list_runs(conn, *, page: int, page_size: int, instrument_id: Optional[int], strategy_type: Optional[str],
              sort: str, order: str) -> dict:
    where, args = [], []
    if instrument_id:
        where.append("run_id IN (SELECT id FROM backtest_runs WHERE instrument_id = %s)"); args.append(instrument_id)
    if strategy_type:
        where.append("strategy_type = %s"); args.append(strategy_type)
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    col = _RUN_SORT.get(sort)
    if col is None:
        raise ApiError(422, "VALIDATION_ERROR", f"Cannot sort by '{sort}'.")
    direction = "ASC" if order.lower() == "asc" else "DESC"
    with conn.cursor() as cur:
        cur.execute(f"SELECT COUNT(*) AS n FROM v_run_summary {clause}", args)
        total = cur.fetchone()["n"]
        cur.execute(f"SELECT * FROM v_run_summary {clause} ORDER BY {col} {direction}, run_id DESC LIMIT %s OFFSET %s",
                    [*args, page_size, (page - 1) * page_size])
        items = _rows(cur.fetchall())
    conn.commit()
    for r in items:
        r["is_synthetic"] = bool(r["is_synthetic"])
    return {"items": items, "total": int(total), "page": page, "page_size": page_size}


def delete_run(conn, run_id: int) -> None:
    with transaction(conn) as cur:
        cur.execute("DELETE FROM backtest_runs WHERE id = %s", (run_id,))  # children go via ON DELETE CASCADE
        if cur.rowcount == 0:
            raise not_found("Backtest")


_TRADE_SORT = {"trade_no", "entry_date", "exit_date", "net_pnl", "return_pct", "holding_days", "quantity"}


def list_trades(conn, run_id: int, *, page: int, page_size: int, sort: str, order: str,
                result: Optional[str], exit_reason: Optional[str]) -> dict:
    if sort not in _TRADE_SORT:
        raise ApiError(422, "VALIDATION_ERROR", f"Cannot sort trades by '{sort}'.")
    where, args = ["run_id = %s"], [run_id]
    if result == "win":
        where.append("net_pnl > 0")
    elif result == "loss":
        where.append("net_pnl < 0")
    elif result == "breakeven":
        where.append("net_pnl = 0")
    elif result is not None:
        raise ApiError(422, "VALIDATION_ERROR", "result must be win, loss or breakeven.")
    if exit_reason:
        where.append("exit_reason = %s"); args.append(exit_reason)
    clause = " AND ".join(where)
    direction = "ASC" if order.lower() == "asc" else "DESC"
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM backtest_runs WHERE id = %s", (run_id,))
        if cur.fetchone() is None:
            conn.commit()
            raise not_found("Backtest")
        cur.execute(f"SELECT COUNT(*) AS n FROM trades WHERE {clause}", args)
        total = cur.fetchone()["n"]
        cur.execute(f"SELECT trade_no, direction, status, entry_date, exit_date, entry_price, exit_price, quantity, entry_fee, "
                    f"exit_fee, gross_pnl, net_pnl, return_pct, holding_days, exit_reason FROM trades WHERE {clause} "
                    f"ORDER BY {sort} {direction}, trade_no LIMIT %s OFFSET %s", [*args, page_size, (page - 1) * page_size])
        items = _rows(cur.fetchall())
    conn.commit()
    return {"items": items, "total": int(total), "page": page, "page_size": page_size}
