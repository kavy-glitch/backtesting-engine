"""Independent cross-check of the C++ engine.

`reference_backtest` below re-implements the documented execution rules in plain Python (written
separately from the C++ code, no shared logic). The engine and the reference must agree on every trade
and on the equity curve for several strategies, data sets and cost settings."""
from __future__ import annotations

import csv
import math
from pathlib import Path

import pytest

from app.core.config import get_settings
from app.integrations.engine_client import EngineClient

SAMPLE = Path(__file__).resolve().parents[3] / "data" / "sample"


def load(name):
    with (SAMPLE / f"{name}.csv").open() as f:
        return [{"date": r["Date"], "open": float(r["Open"]), "high": float(r["High"]), "low": float(r["Low"]),
                 "close": float(r["Close"]), "volume": float(r["Volume"])} for r in csv.DictReader(f)]


def sma(vals, n):
    return [None if i + 1 < n else sum(vals[i + 1 - n:i + 1]) / n for i in range(len(vals))]


def ema(vals, n):
    out, a = [None] * len(vals), 2 / (n + 1)
    if len(vals) < n:
        return out
    out[n - 1] = sum(vals[:n]) / n
    for i in range(n, len(vals)):
        out[i] = a * vals[i] + (1 - a) * out[i - 1]
    return out


def reference_backtest(candles, kind, fast, slow, capital, fee_pct, slip_bps):
    closes = [c["close"] for c in candles]
    f, s = (sma if kind == "sma" else ema)(closes, fast), (sma if kind == "sma" else ema)(closes, slow)
    cash, qty, entry, pending, equity, trades = capital, 0.0, None, None, [], []
    slip = slip_bps / 10000
    for i, c in enumerate(candles):
        if pending == "buy" and qty == 0:
            fill = c["open"] * (1 + slip)
            q = math.floor(cash / (fill * (1 + fee_pct / 100)))
            while q > 0 and q * fill * (1 + fee_pct / 100) > cash + 1e-9:
                q -= 1
            if q > 0:
                fee = q * fill * fee_pct / 100
                cash -= q * fill + fee
                qty, entry = q, (i, fill, fee)
        elif pending == "sell" and qty > 0:
            fill = c["open"] * (1 - slip)
            fee = qty * fill * fee_pct / 100
            cash += qty * fill - fee
            trades.append({"entry_index": entry[0], "exit_index": i, "net": (fill - entry[1]) * qty - entry[2] - fee, "qty": qty})
            qty, entry = 0.0, None
        pending = None
        equity.append(cash + qty * c["close"])
        if i + 1 < len(candles) and i > 0 and None not in (f[i - 1], s[i - 1], f[i], s[i]):
            if f[i - 1] <= s[i - 1] and f[i] > s[i]:
                pending = "buy"
            elif f[i - 1] >= s[i - 1] and f[i] < s[i]:
                pending = "sell"
    peak, mdd = 0.0, 0.0
    for e in equity:
        peak = max(peak, e)
        mdd = max(mdd, (peak - e) / peak * 100)
    return {"equity": equity, "trades": trades, "max_dd": mdd, "open_qty": qty}


@pytest.mark.parametrize("series", ["SYNTH-TREND", "SYNTH-VOLATILE", "SYNTH-RANGE"])
@pytest.mark.parametrize("kind,type_,fast,slow", [("sma", "sma_crossover", 10, 40), ("sma", "sma_crossover", 5, 20), ("ema", "ema_crossover", 12, 26)])
@pytest.mark.parametrize("fee,slip", [(0.0, 0.0), (0.1, 5.0)])
def test_engine_matches_independent_reference(series, kind, type_, fast, slow, fee, slip):
    s = get_settings()
    candles = load(series)
    out = EngineClient(s.engine_path).run({"symbol": series, "candles": candles, "strategy": {"type": type_, "params": {"fast": fast, "slow": slow}},
                                           "config": {"initial_capital": 100000, "fee_pct": fee, "slippage_bps": slip}})["result"]
    ref = reference_backtest(candles, kind, fast, slow, 100000, fee, slip)
    assert len(out["equity"]) == len(ref["equity"])
    for i, (a, b) in enumerate(zip(out["equity"], ref["equity"])):
        assert a["equity"] == pytest.approx(b, rel=1e-9, abs=1e-6), f"equity differs at bar {i}"
    assert len(out["trades"]) == len(ref["trades"])
    for t, r in zip(out["trades"], ref["trades"]):
        assert (t["entry_index"], t["exit_index"]) == (r["entry_index"], r["exit_index"])
        assert t["net_pnl"] == pytest.approx(r["net"], rel=1e-9, abs=1e-6)
    assert out["metrics"]["max_drawdown_pct"] == pytest.approx(ref["max_dd"], rel=1e-9, abs=1e-9)
    assert (out["open_trade"] is not None) == (ref["open_qty"] > 0)
    assert len(out["trades"]) >= 1 or series == "SYNTH-TREND"   # the data really exercises the strategy
