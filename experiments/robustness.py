"""How much do the report's single-path conclusions depend on one random seed?

Generates many synthetic price paths with the SAME parameters as SYNTH-TREND and SYNTH-RANGE (different seeds),
runs buy-and-hold, SMA 10/30 and EMA 12/26 on each, and summarises the spread of results.

    python experiments/robustness.py [--engine engine/build/engine] [--paths 200]

Writes experiments/robustness.json. Synthetic data only: this says how the strategies behave on random walks
with a given drift, not how they would behave on real markets.
"""
from __future__ import annotations

import argparse
import json
import statistics
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from scripts.generate_synthetic_data import generate  # noqa: E402

CFG = {"initial_capital": 100000, "fee_pct": 0.1, "slippage_bps": 5, "sizing": {"mode": "percent_equity", "value": 100}}
SETS = {"trend-like (drift 18%, vol 20%)": (1000.0, 0.18, 0.20, 0.0), "range-like (drift 0%, vol 25%, mean-reverting)": (250.0, 0.0, 0.25, 0.06)}
STRATS = {"SMA 10/30": ("sma_crossover", {"fast": 10, "slow": 30}), "EMA 12/26": ("ema_crossover", {"fast": 12, "slow": 26})}


def run(engine, candles, stype, params):
    req = {"symbol": "ROBUST", "candles": candles, "strategy": {"type": stype, "params": params}, "config": CFG}
    out = subprocess.run([engine], input=json.dumps(req), capture_output=True, text=True, check=True)
    r = json.loads(out.stdout)
    if not r["ok"]:
        raise RuntimeError(r["error"])
    return r["result"]["metrics"]


def pct(values, q):
    s = sorted(values)
    return s[min(len(s) - 1, int(q * (len(s) - 1) + 0.5))]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", default=str(ROOT / "engine" / "build" / "engine"))
    ap.add_argument("--paths", type=int, default=200)
    a = ap.parse_args()
    out = {"paths_per_set": a.paths, "seeds": "1000..(1000+paths-1)", "sets": {}}
    for label, (p0, mu, sigma, revert) in SETS.items():
        rows = {n: {"ret": [], "dd": [], "beats": 0} for n in STRATS}
        bench = []
        for seed in range(1000, 1000 + a.paths):
            candles = [dict(date=d, open=o, high=h, low=l, close=c, volume=v) for d, o, h, l, c, v in generate(p0, mu, sigma, revert, seed)]
            for n, (t, p) in STRATS.items():
                m = run(a.engine, candles, t, p)
                rows[n]["ret"].append(m["total_return_pct"]); rows[n]["dd"].append(m["max_drawdown_pct"])
                rows[n]["beats"] += m["total_return_pct"] > m["buy_hold_return_pct"]
            bench.append(m["buy_hold_return_pct"])
        summ = {"benchmark_return_pct": {"median": statistics.median(bench), "p5": pct(bench, .05), "p95": pct(bench, .95), "all": bench}}
        for n, d in rows.items():
            summ[n] = {"median_return_pct": statistics.median(d["ret"]), "p5_return_pct": pct(d["ret"], .05), "p95_return_pct": pct(d["ret"], .95),
                       "median_max_drawdown_pct": statistics.median(d["dd"]), "share_beating_benchmark_pct": 100.0 * d["beats"] / a.paths,
                       "share_losing_money_pct": 100.0 * sum(r < 0 for r in d["ret"]) / a.paths}
        out["sets"][label] = summ
    (ROOT / "experiments" / "robustness.json").write_text(json.dumps(out, indent=1))
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
