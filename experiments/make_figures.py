"""Draw the report's Figures 7.1 and 7.2 from engine output (no hand-made data).

    python experiments/make_figures.py [--engine engine/build/engine]   ->  report/figures/*.pdf
"""
from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from reproduce_report import ROOT, STRATEGIES, run  # noqa: E402

OUT = ROOT / "report" / "figures"
COL = ["#6b7280", "#1d3a8a", "#0f766e", "#c2410c", "#7c3aed"]


def d(s: str) -> date:
    return date.fromisoformat(s)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", default=str(ROOT / "engine" / "build" / "engine"))
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    plt.rcParams.update({"font.size": 9, "axes.grid": True, "grid.alpha": .25, "axes.spines.top": False, "axes.spines.right": False})

    fig, ax = plt.subplots(figsize=(6.6, 3.3))
    results = {}
    for (name, t, p), c in zip(STRATEGIES, COL):
        r = run(a.engine, "SYNTH-TREND", t, p)
        results[name] = r
        ax.plot([d(e["date"]) for e in r["equity"]], [e["equity"] for e in r["equity"]], label=name, color=c, lw=1.1)
    ax.set_ylabel("Equity (currency units)"); ax.legend(ncol=3, frameon=False, fontsize=8)
    fig.autofmt_xdate(); fig.tight_layout(); fig.savefig(OUT / "equity_strategies.pdf"); plt.close(fig)

    r = results["SMA 10/30"]
    dates = [d(e["date"]) for e in r["equity"]]
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(6.6, 4.2), sharex=True, gridspec_kw={"height_ratios": [3, 1.2]})
    ax1.plot(dates, [e["equity"] for e in r["equity"]], color=COL[1], lw=1.2, label="SMA crossover 10/30")
    ax1.plot(dates, [b["equity"] for b in r["benchmark"]], color=COL[3], lw=1.1, ls="--", label="Buy-and-hold benchmark")
    trades = list(r["trades"]) + ([r["open_trade"]] if r.get("open_trade") else [])
    for t in trades:
        ax1.axvspan(d(t["entry_date"]), d(t["exit_date"]), color="#93c5fd", alpha=.22, lw=0)
    ax1.set_ylabel("Equity"); ax1.legend(frameon=False, fontsize=8, loc="upper left")
    ax2.fill_between(dates, [e["drawdown_pct"] for e in r["equity"]], 0, color="#e08b8b")
    ax2.set_ylabel("Drawdown (%)")
    fig.autofmt_xdate(); fig.tight_layout(); fig.savefig(OUT / "sma_vs_benchmark.pdf"); plt.close(fig)
    print("wrote", sorted(p.name for p in OUT.glob("*.pdf")))


if __name__ == "__main__":
    main()
