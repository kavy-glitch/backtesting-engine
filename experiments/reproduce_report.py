"""Regenerate every number in the report's worked experiment (Chapter 7) from the compiled engine.

    python experiments/reproduce_report.py [--engine engine/build/engine]

Writes experiments/results.json and prints the tables. The synthetic data files are fixed CSVs, the
engine is deterministic, so two runs give identical output. Nothing here is typed in by hand.
"""
from __future__ import annotations

import argparse
import json
import statistics
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE_CFG = {"initial_capital": 100000, "fee_pct": 0.1, "slippage_bps": 5,
            "sizing": {"mode": "percent_equity", "value": 100}}
STRATEGIES = [
    ("Buy and Hold", "buy_and_hold", {}),
    ("SMA 10/30", "sma_crossover", {"fast": 10, "slow": 30}),
    ("EMA 12/26", "ema_crossover", {"fast": 12, "slow": 26}),
    ("RSI 14 (30/70)", "rsi_threshold", {"period": 14, "oversold": 30, "overbought": 70}),
    ("MACD 12/26/9", "macd_crossover", {"fast": 12, "slow": 26, "signal": 9}),
]


def run(engine: str, symbol: str, stype: str, params: dict, **cfg) -> dict:
    req = {"symbol": symbol, "candles_csv": str(ROOT / "data" / "sample" / f"{symbol}.csv"),
           "strategy": {"type": stype, "params": params}, "config": {**BASE_CFG, **cfg}}
    out = subprocess.run([engine], input=json.dumps(req), capture_output=True, text=True, check=True)
    resp = json.loads(out.stdout)
    if not resp["ok"]:
        raise RuntimeError(resp["error"])
    return resp["result"]


def row(name: str, r: dict) -> dict:
    m = r["metrics"]
    return {"strategy": name, "final_equity": m["final_equity"], "return_pct": m["total_return_pct"],
            "max_dd_pct": m["max_drawdown_pct"], "sharpe": m["sharpe_ratio"], "closed_trades": m["closed_trades"],
            "win_rate_pct": m["win_rate_pct"], "fees": m["total_fees"], "exposure_pct": m["exposure_pct"],
            "benchmark_return_pct": m["buy_hold_return_pct"]}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", default=str(ROOT / "engine" / "build" / "engine"))
    a = ap.parse_args()
    res: dict = {}

    res["table_7_3_strategies"] = [row(n, run(a.engine, "SYNTH-TREND", t, p)) for n, t, p in STRATEGIES]
    sma = run(a.engine, "SYNTH-TREND", "sma_crossover", {"fast": 10, "slow": 30})
    res["table_7_4_sma_metrics"] = sma["metrics"]
    res["table_7_5_first_trades"] = [{k: t[k] for k in ("entry_date", "exit_date", "entry_price", "exit_price", "quantity", "net_pnl")}
                                     for t in sma["trades"][:5]]
    res["table_7_6_series"] = [dict(row("SMA 10/30", run(a.engine, s, "sma_crossover", {"fast": 10, "slow": 30})), series=s)
                               for s in ("SYNTH-TREND", "SYNTH-VOLATILE", "SYNTH-RANGE")]
    res["table_7_7_costs"] = []
    for fee, bps in ((0, 0), (0.10, 5), (0.25, 20)):
        r = run(a.engine, "SYNTH-TREND", "sma_crossover", {"fast": 10, "slow": 30}, fee_pct=fee, slippage_bps=bps)
        res["table_7_7_costs"].append({"fee_pct": fee, "slippage_bps": bps, "return_pct": r["metrics"]["total_return_pct"],
                                       "total_fees": r["metrics"]["total_fees"], "closed_trades": r["metrics"]["closed_trades"]})
    prot = run(a.engine, "SYNTH-TREND", "sma_crossover", {"fast": 10, "slow": 30}, stop_loss_pct=5, take_profit_pct=15)
    reasons: dict = {}
    for t in prot["trades"]:
        reasons[t["exit_reason"]] = reasons.get(t["exit_reason"], 0) + 1
    res["protective_exits"] = {"return_pct": prot["metrics"]["total_return_pct"], "closed_trades": len(prot["trades"]),
                               "exit_reasons": reasons}
    times = []
    for _ in range(3):  # warm-up
        run(a.engine, "SYNTH-TREND", "sma_crossover", {"fast": 10, "slow": 30})
    for _ in range(30):
        t0 = time.perf_counter()
        run(a.engine, "SYNTH-TREND", "sma_crossover", {"fast": 10, "slow": 30})
        times.append((time.perf_counter() - t0) * 1000)
    res["timing_ms"] = {"median": statistics.median(times), "min": min(times), "max": max(times), "runs": len(times),
                        "includes": "process start-up, CSV read, simulation, JSON encode/decode (Python subprocess)"}
    (ROOT / "experiments" / "results.json").write_text(json.dumps(res, indent=1))
    for key, val in res.items():
        print(f"\n== {key}")
        print(json.dumps(val, indent=1) if isinstance(val, dict) else "\n".join(json.dumps(v) for v in val))


if __name__ == "__main__":
    main()
