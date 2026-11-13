"""CSV exports of a saved backtest (with spreadsheet formula-injection protection)."""
from __future__ import annotations

import csv
import io
from typing import Any


def _safe(v: Any) -> Any:
    """Neutralise spreadsheet formula injection in text cells."""
    if isinstance(v, str) and v[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + v
    return v


def _csv(header: list[str], rows: list[list[Any]]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(header)
    for r in rows:
        w.writerow(["" if v is None else _safe(v) for v in r])
    return buf.getvalue()


TRADE_COLS = ["trade_no", "status", "direction", "entry_date", "exit_date", "entry_price", "exit_price", "quantity",
              "entry_fee", "exit_fee", "gross_pnl", "net_pnl", "return_pct", "holding_days", "exit_reason"]
EQUITY_COLS = ["date", "equity", "cash", "position_value", "drawdown_pct", "benchmark_equity"]


def export_csv(kind: str, run: dict) -> str:
    if kind == "trades":
        return _csv(TRADE_COLS, [[t[c] for c in TRADE_COLS] for t in run["trades"]])
    if kind == "equity":
        return _csv(EQUITY_COLS, [[e[c] for c in EQUITY_COLS] for e in run["equity"]])
    notes = run["metrics"].get("notes", {})
    if kind == "metrics":
        return _csv(["metric", "value", "note"], [[k, v, notes.get(k, "")] for k, v in run["metrics"].items() if k != "notes"])
    if kind == "summary":
        rows: list[list[Any]] = [["run_id", run["id"]], ["name", run["name"]], ["symbol", run["instrument"]["symbol"]],
                                 ["synthetic_data", run["instrument"]["is_synthetic"]],
                                 ["strategy", run["strategy"]["name"]]]
        rows += [[f"param.{k}", v] for k, v in run["strategy"]["params"].items()]
        rows += [["period_start", run["period"]["start"]], ["period_end", run["period"]["end"]]]
        c = run["config"]
        rows += [[f"config.{k}", v] for k, v in c.items() if k != "position_sizing"]
        rows += [["config.sizing_mode", c["position_sizing"]["mode"]], ["config.sizing_value", c["position_sizing"]["value"]]]
        rows += [[f"metric.{k}", v] for k, v in run["metrics"].items() if k != "notes"]
        return _csv(["key", "value"], rows)
    raise ApiError(422, "VALIDATION_ERROR", "kind must be one of: trades, equity, metrics, summary")
