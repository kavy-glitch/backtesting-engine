"""End-to-end check of a RUNNING stack (API + engine + MySQL) over HTTP.

    python -m scripts.smoke_test                       # default http://localhost:8000
    python -m scripts.smoke_test http://localhost:8080 # through the nginx front end (Docker)

Requires the synthetic demo data (python -m scripts.load_demo_data). Uses only the standard library.
It saves one backtest and deletes it again, leaving the database as it found it."""
from __future__ import annotations

import csv
import io
import json
import sys
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/") + "/api/v1"
failures: list[str] = []


def call(method: str, path: str, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if r.headers.get_content_type() == "application/json" and raw else raw)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, raw


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}{(' - ' + detail) if detail and not ok else ''}")
    if not ok:
        failures.append(name)


def main() -> None:
    st, health = call("GET", "/health")
    check("health is ok", st == 200 and health["status"] == "ok", str(health))
    st, insts = call("GET", "/instruments")
    synth = next((i for i in insts if i["symbol"] == "SYNTH-TREND"), None) if st == 200 else None
    check("synthetic demo instrument is loaded and labelled", bool(synth and synth["is_synthetic"] and synth["candle_count"] > 700))
    if not synth:
        print("Load the demo data first: python -m scripts.load_demo_data"); sys.exit(1)
    st, strategies = call("GET", "/strategies")
    check("5 strategies in the catalogue", st == 200 and len(strategies) == 5)

    body = {"instrument_id": synth["id"], "strategy_type": "sma_crossover", "params": {"fast": 10, "slow": 40},
            "initial_capital": 100000, "fee_pct": 0.1, "slippage_bps": 5, "name": "smoke test run"}
    st, preview = call("POST", "/backtests/run", body)
    check("run a backtest", st == 200 and len(preview["equity"]) == synth["candle_count"], str(preview)[:200])
    check("candles, trades and metrics are present", st == 200 and len(preview["candles"]) > 0 and preview["metrics"]["closed_trades"] > 0)
    closed = [t for t in preview["trades"] if t["status"] == "closed"]
    check("trade P&L adds up to realised P&L", abs(sum(t["net_pnl"] for t in closed) - preview["metrics"]["realized_pnl"]) < 1e-6)

    st, saved = call("POST", "/backtests", body)
    check("save the backtest", st == 201 and saved["id"])
    rid = saved["id"]
    st, got = call("GET", f"/backtests/{rid}")
    check("saved result equals the preview", st == 200 and got["metrics"] == preview["metrics"] and got["trades"] == preview["trades"] and got["equity"] == preview["equity"])
    st, page = call("GET", "/backtests?page=1&page_size=5")
    check("saved backtest is listed", st == 200 and any(r["run_id"] == rid for r in page["items"]))
    st, trades = call("GET", f"/backtests/{rid}/trades?result=win&sort=net_pnl&order=desc&page_size=3")
    check("trade filtering/sorting/pagination", st == 200 and all(t["net_pnl"] > 0 for t in trades["items"]) and len(trades["items"]) <= 3)
    st, csv_text = call("GET", f"/backtests/{rid}/export/trades")
    rows = list(csv.DictReader(io.StringIO(csv_text))) if st == 200 else []
    check("trades CSV export matches the result", len(rows) == len(got["trades"]) and all(float(r["net_pnl"]) == t["net_pnl"] for r, t in zip(rows, got["trades"])))
    st, cmp_ = call("POST", "/backtests/compare", {"instrument_id": synth["id"], "strategies": [{"strategy_type": "buy_and_hold"}, {"strategy_type": "ema_crossover"}, {"strategy_type": "rsi_threshold"}]})
    check("compare three strategies", st == 200 and len(cmp_["results"]) == 3 and all(r["error"] is None for r in cmp_["results"]))
    st, err = call("POST", "/backtests/run", {**body, "params": {"fast": 50, "slow": 10}})
    check("invalid parameters are rejected with 422", st == 422 and err["error"]["code"] == "INVALID_PARAMETER")
    st, _ = call("DELETE", f"/backtests/{rid}")
    check("delete the saved backtest", st == 204)
    st, _ = call("GET", f"/backtests/{rid}")
    check("deleted backtest is gone", st == 404)
    print("\nALL CHECKS PASSED" if not failures else f"\n{len(failures)} CHECK(S) FAILED: {failures}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
