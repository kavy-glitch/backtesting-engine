"""Turn experiments/results.json and robustness.json into LaTeX fragments (report/generated/*.tex).

Run after reproduce_report.py and robustness.py. The report includes these files with \\input, so every number
in Chapter 7 and the abstract comes from the engine, not from the keyboard.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GEN = ROOT / "report" / "generated"
GEN.mkdir(parents=True, exist_ok=True)
R = json.loads((ROOT / "experiments" / "results.json").read_text())
B = json.loads((ROOT / "experiments" / "robustness.json").read_text())


def n(x, d=2, comma=True):
    if x is None:
        return "--"
    s = f"{abs(x):,.{d}f}" if comma else f"{abs(x):.{d}f}"
    return ("$-$" if x < 0 and float(s.replace(",", "")) != 0 else "") + s


def w(name, text):
    (GEN / name).write_text(text)


rows = R["table_7_3_strategies"]
w("t_strategies.tex", "\\begin{tabular}{@{}lrrrrrrrr@{}}\n\\toprule\nStrategy & Final equity & Return \\% & Max DD \\% & Sharpe & Closed & Win \\% & Fees & Exposure \\% \\\\\n\\midrule\n" +
  "".join(f"{r['strategy']} & {n(r['final_equity'])} & {n(r['return_pct'])} & {n(r['max_dd_pct'])} & {n(r['sharpe'])} & {r['closed_trades']} & {n(r['win_rate_pct'], 1)} & {n(r['fees'])} & {n(r['exposure_pct'], 1)} \\\\\n" for r in rows) +
  "\\bottomrule\n\\end{tabular}\n")

m = R["table_7_4_sma_metrics"]
left = [("Final equity", n(m["final_equity"])), ("Net profit", n(m["net_profit"])), ("Total return", n(m["total_return_pct"]) + "\\%"),
        ("CAGR", n(m["cagr_pct"]) + "\\%"), ("Max drawdown", n(m["max_drawdown_pct"]) + "\\%"), ("Annual volatility", n(m["annual_volatility_pct"]) + "\\%"),
        ("Sharpe ratio", n(m["sharpe_ratio"], 3)), ("Sortino ratio", n(m["sortino_ratio"], 3))]
right = [("Win rate", f"{n(m['win_rate_pct'])}\\% ({m['winning_trades']} of {m['closed_trades']})"),
         ("Average win / loss", f"{n(m['avg_win'])} / {n(m['avg_loss'])}"), ("Profit factor", n(m["profit_factor"], 3)),
         ("Total fees", n(m["total_fees"])), ("Exposure", n(m["exposure_pct"]) + "\\%"),
         (f"Realised P\\&L ({m['closed_trades']} closed)", n(m["realized_pnl"])), ("Unrealised P\\&L (1 open)", n(m["unrealized_pnl"])),
         ("Buy-and-hold return", n(m["buy_hold_return_pct"]) + "\\%")]
w("t_sma_metrics.tex", "\\begin{tabular}{@{}lrlr@{}}\n\\toprule\nMetric & Value & Metric & Value \\\\\n\\midrule\n" +
  "".join(f"{a} & {b} & {c} & {d} \\\\\n" for (a, b), (c, d) in zip(left, right)) + "\\bottomrule\n\\end{tabular}\n")

w("t_trades.tex", "\\begin{tabular}{@{}llrrrr@{}}\n\\toprule\nEntry & Exit & Entry price & Exit price & Qty & Net P\\&L \\\\\n\\midrule\n" +
  "".join(f"{t['entry_date']} & {t['exit_date']} & {n(t['entry_price'])} & {n(t['exit_price'])} & {t['quantity']:.0f} & {n(t['net_pnl'])} \\\\\n" for t in R["table_7_5_first_trades"]) +
  "\\bottomrule\n\\end{tabular}\n")

w("t_series.tex", "\\begin{tabular}{@{}lrrrr@{}}\n\\toprule\nSeries & Strategy return \\% & Benchmark \\% & Max DD \\% & Closed trades \\\\\n\\midrule\n" +
  "".join(f"\\texttt{{{r['series']}}} & {n(r['return_pct'])} & {n(r['benchmark_return_pct'])} & {n(r['max_dd_pct'])} & {r['closed_trades']} \\\\\n" for r in R["table_7_6_series"]) +
  "\\bottomrule\n\\end{tabular}\n")

w("t_costs.tex", "\\begin{tabular}{@{}lrr@{}}\n\\toprule\nFee per fill / slippage & Return \\% & Total fees \\\\\n\\midrule\n" +
  "".join(f"{c['fee_pct']:.2f}\\% / {c['slippage_bps']:g} bps & {n(c['return_pct'])} & {n(c['total_fees'])} \\\\\n" for c in R["table_7_7_costs"]) +
  "\\bottomrule\n\\end{tabular}\n")

rob = []
for label, s in B["sets"].items():
    for name in ("SMA 10/30", "EMA 12/26"):
        v = s[name]
        rob.append(f"{label.split(' (')[0]} & {name} & {n(v['median_return_pct'], 1)} & [{n(v['p5_return_pct'], 1)}, {n(v['p95_return_pct'], 1)}] & {n(s['benchmark_return_pct']['median'], 1)} & {n(v['share_beating_benchmark_pct'], 1)} & {n(v['share_losing_money_pct'], 1)} \\\\\n")
w("t_robust.tex", "\\begin{tabular}{@{}llrrrrr@{}}\n\\toprule\nPath family & Strategy & Median ret.\\ \\% & 5th--95th pct.\\ \\% & Bench.\\ median \\% & Beats bench.\\ \\% & Loses money \\% \\\\\n\\midrule\n" + "".join(rob) + "\\bottomrule\n\\end{tabular}\n")

pe, tm, s1 = R["protective_exits"], R["timing_ms"], rows[1]
tt = rows[1]
macros = {
    "smaReturn": n(tt["return_pct"]), "smaDD": n(tt["max_dd_pct"]), "benchReturn": n(tt["benchmark_return_pct"]),
    "bhReturn": n(rows[0]["return_pct"]), "bhDD": n(rows[0]["max_dd_pct"]), "emaReturn": n(rows[2]["return_pct"]),
    "rangeReturn": n(R["table_7_6_series"][2]["return_pct"]), "rangeBench": n(R["table_7_6_series"][2]["benchmark_return_pct"]),
    "protReturn": n(pe["return_pct"]), "protTrades": str(pe["closed_trades"]), "protSignal": str(pe["exit_reasons"].get("signal", 0)),
    "protTP": str(pe["exit_reasons"].get("take_profit", 0)), "protSL": str(pe["exit_reasons"].get("stop_loss", 0)),
    "timeMedian": f"{tm['median']:.1f}", "timeMin": f"{tm['min']:.1f}", "timeMax": f"{tm['max']:.1f}", "timeRuns": str(tm["runs"]),
    "costDrop": n(R["table_7_7_costs"][0]["return_pct"] - R["table_7_7_costs"][2]["return_pct"], 1),
    "robPaths": str(B["paths_per_set"]),
    "unrealShare": n(R["table_7_4_sma_metrics"]["unrealized_pnl"] / R["table_7_4_sma_metrics"]["net_profit"] * 100, 0, False),
    "trendPercentile": n(100.0 * sum(b < rows[1]["benchmark_return_pct"] for b in B["sets"]["trend-like (drift 18%, vol 20%)"]["benchmark_return_pct"]["all"]) / B["paths_per_set"], 0, False),
    "trendBenchMedian": n(B["sets"]["trend-like (drift 18%, vol 20%)"]["benchmark_return_pct"]["median"], 0, False),
}
w("macros.tex", "".join(f"\\newcommand{{\\{k}}}{{{v}}}\n" for k, v in macros.items()))
print("wrote", sorted(p.name for p in GEN.glob("*.tex")))
