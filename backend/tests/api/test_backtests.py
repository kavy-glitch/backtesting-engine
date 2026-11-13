"""Backtest execution, persistence, retrieval, trades, exports, comparison, saved strategies."""
from __future__ import annotations

import csv
import io
import math

import pytest

from tests.conftest import import_rows, make_instrument, random_rows, run_body


def _run(client, iid, **over):
    r = client.post("/api/v1/backtests/run", json=run_body(iid, **over))
    assert r.status_code == 200, r.text
    return r.json()


def test_run_returns_full_consistent_result_and_saves_nothing(client, loaded):
    res = _run(client, loaded["id"])
    assert res["id"] is None
    assert len(res["equity"]) == 400 == len(res["candles"]) == res["period"]["candles"]
    assert res["metrics"]["initial_capital"] == 100000
    assert len(res["trades"]) >= 3
    closed = [t for t in res["trades"] if t["status"] == "closed"]
    assert sum(t["net_pnl"] for t in closed) == pytest.approx(res["metrics"]["realized_pnl"], abs=1e-6)
    assert res["equity"][-1]["equity"] == pytest.approx(res["metrics"]["final_equity"])
    assert res["metrics"]["final_equity"] == pytest.approx(
        100000 + res["metrics"]["realized_pnl"] + res["metrics"]["unrealized_pnl"], abs=1e-6)
    assert {i["name"] for i in res["indicators"]} == {"SMA 5", "SMA 20"}
    assert all(math.isfinite(v) for v in
               [res["metrics"]["total_return_pct"], res["metrics"]["max_drawdown_pct"]])
    assert client.get("/api/v1/backtests").json()["total"] == 0


def test_every_strategy_runs_through_the_api(client, loaded):
    for s in client.get("/api/v1/strategies").json():
        res = _run(client, loaded["id"], strategy_type=s["type"], params={})
        assert res["strategy"]["type"] == s["type"]
        assert len(res["equity"]) == 400


def test_date_range_is_respected(client, loaded):
    rows = loaded["rows"]
    res = _run(client, loaded["id"], start_date=str(rows[100]["date"]), end_date=str(rows[299]["date"]))
    assert res["period"]["candles"] == 200 and res["period"]["start"] == str(rows[100]["date"])


def test_run_input_validation(client, loaded):
    iid = loaded["id"]
    bad = {
        "negative capital": run_body(iid, initial_capital=-5),
        "zero capital": run_body(iid, initial_capital=0),
        "fee over 100": run_body(iid, fee_pct=120),
        "negative slippage": run_body(iid, slippage_bps=-1),
        "end before start": run_body(iid, start_date="2023-06-01", end_date="2023-01-01"),
        "bad sizing": run_body(iid, position_sizing={"mode": "percent_equity", "value": 150}),
        "unknown field": run_body(iid, leverage=5),
        "stop 0": run_body(iid, stop_loss_pct=0),
        "string capital": run_body(iid, initial_capital="lots"),
        "missing strategy": {"instrument_id": iid},
    }
    for name, body in bad.items():
        r = client.post("/api/v1/backtests/run", json=body)
        assert r.status_code == 422, name
        assert r.json()["error"]["code"] == "VALIDATION_ERROR", name
    # engine-side parameter rules surface as 422 with the engine's code
    r = client.post("/api/v1/backtests/run", json=run_body(iid, params={"fast": 30, "slow": 10}))
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_PARAMETER"
    r = client.post("/api/v1/backtests/run", json=run_body(iid, strategy_type="nope", params={}))
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_PARAMETER"
    r = client.post("/api/v1/backtests/run", json=run_body(iid, params={"fast": 2.5, "slow": 10}))
    assert r.status_code == 422


def test_run_missing_resources_and_insufficient_data(client):
    assert client.post("/api/v1/backtests/run", json=run_body(999)).status_code == 404
    iid = make_instrument(client)
    r = client.post("/api/v1/backtests/run", json=run_body(iid))
    assert r.status_code == 422 and r.json()["error"]["code"] == "NO_DATA"
    import_rows(client, iid, random_rows(10))
    r = client.post("/api/v1/backtests/run", json=run_body(iid, params={"fast": 5, "slow": 50}))
    assert r.status_code == 422 and r.json()["error"]["code"] == "INSUFFICIENT_DATA"


def test_insufficient_capital_is_reported_not_crashed(client, loaded):
    res = _run(client, loaded["id"], initial_capital=10, fee_pct=0)
    assert res["trades"] == [] and len(res["rejected_orders"]) >= 1
    assert res["metrics"]["final_equity"] == 10


def test_save_then_retrieve_matches_preview_exactly(client, loaded):
    body = run_body(loaded["id"], name="My SMA run", stop_loss_pct=8, take_profit_pct=15)
    preview = client.post("/api/v1/backtests/run", json=body).json()
    r = client.post("/api/v1/backtests", json=body)
    assert r.status_code == 201, r.text
    saved = r.json()
    assert saved["id"] and saved["name"] == "My SMA run" and saved["created_at"]
    got = client.get(f"/api/v1/backtests/{saved['id']}").json()
    for part in ("metrics", "trades", "equity", "strategy", "config", "period", "candles", "indicators", "rejected_orders"):
        assert got[part] == preview[part], part   # saved == what the user saw, bit for bit
    assert got["metrics"] == saved["metrics"]


def test_list_filter_sort_paginate_and_delete(client, loaded):
    iid = loaded["id"]
    ids = []
    for fast, slow in ((3, 10), (5, 20), (8, 30), (10, 40)):
        ids.append(client.post("/api/v1/backtests", json=run_body(iid, params={"fast": fast, "slow": slow}, name=f"r{fast}")).json()["id"])
    client.post("/api/v1/backtests", json=run_body(iid, strategy_type="buy_and_hold", params={}, name="bh"))
    page1 = client.get("/api/v1/backtests", params={"page_size": 2}).json()
    assert page1["total"] == 5 and len(page1["items"]) == 2 and page1["page"] == 1
    page3 = client.get("/api/v1/backtests", params={"page_size": 2, "page": 3}).json()
    assert len(page3["items"]) == 1
    only_bh = client.get("/api/v1/backtests", params={"strategy_type": "buy_and_hold"}).json()
    assert only_bh["total"] == 1 and only_bh["items"][0]["run_name"] == "bh"
    by_return = client.get("/api/v1/backtests", params={"sort": "total_return_pct", "order": "desc"}).json()["items"]
    returns = [x["total_return_pct"] for x in by_return]
    assert returns == sorted(returns, reverse=True)
    assert client.get("/api/v1/backtests", params={"sort": "name; DROP TABLE trades"}).status_code == 422
    assert client.get("/api/v1/backtests", params={"page": 0}).status_code == 422
    assert client.get("/api/v1/backtests", params={"page_size": 1000}).status_code == 422
    assert client.delete(f"/api/v1/backtests/{ids[0]}").status_code == 204
    assert client.get(f"/api/v1/backtests/{ids[0]}").status_code == 404
    assert client.delete(f"/api/v1/backtests/{ids[0]}").status_code == 404
    assert client.get("/api/v1/backtests").json()["total"] == 4


def test_trades_endpoint_pagination_filter_sort(client, loaded):
    saved = client.post("/api/v1/backtests", json=run_body(loaded["id"], params={"fast": 3, "slow": 10})).json()
    rid, all_trades = saved["id"], saved["trades"]
    assert len(all_trades) >= 5
    p = client.get(f"/api/v1/backtests/{rid}/trades", params={"page_size": 3}).json()
    assert p["total"] == len(all_trades) and len(p["items"]) == 3
    wins = client.get(f"/api/v1/backtests/{rid}/trades", params={"result": "win", "page_size": 200}).json()
    assert all(t["net_pnl"] > 0 for t in wins["items"])
    assert wins["total"] == sum(1 for t in all_trades if t["net_pnl"] > 0)
    losses = client.get(f"/api/v1/backtests/{rid}/trades", params={"result": "loss", "page_size": 200}).json()
    assert wins["total"] + losses["total"] <= len(all_trades)
    srt = client.get(f"/api/v1/backtests/{rid}/trades", params={"sort": "net_pnl", "order": "desc", "page_size": 200}).json()["items"]
    assert [t["net_pnl"] for t in srt] == sorted((t["net_pnl"] for t in srt), reverse=True)
    assert client.get(f"/api/v1/backtests/{rid}/trades", params={"sort": "password"}).status_code == 422
    assert client.get(f"/api/v1/backtests/{rid}/trades", params={"result": "maybe"}).status_code == 422
    assert client.get("/api/v1/backtests/9999/trades").status_code == 404


def test_trade_ledger_agrees_with_portfolio_accounting(client, loaded):
    saved = client.post("/api/v1/backtests", json=run_body(loaded["id"], fee_pct=0.2, slippage_bps=10)).json()
    candles = {c["date"]: c for c in saved["candles"]}
    cash = saved["config"]["initial_capital"]
    for t in (x for x in saved["trades"] if x["status"] == "closed"):
        assert t["entry_date"] < t["exit_date"]
        assert t["entry_price"] >= candles[t["entry_date"]]["open"]            # slippage hurts the buyer
        assert t["exit_price"] <= candles[t["exit_date"]]["open"] or t["exit_reason"] != "signal"
        assert t["net_pnl"] == pytest.approx(t["gross_pnl"] - t["entry_fee"] - t["exit_fee"])
        cash += t["net_pnl"]
    open_t = [t for t in saved["trades"] if t["status"] == "open"]
    final = cash + (open_t[0]["net_pnl"] if open_t else 0)
    assert final == pytest.approx(saved["metrics"]["final_equity"], abs=1e-6)


def test_exports_match_the_displayed_results(client, loaded):
    saved = client.post("/api/v1/backtests", json=run_body(loaded["id"], name="=cmd|' /C calc'!A0")).json()
    rid = saved["id"]
    r = client.get(f"/api/v1/backtests/{rid}/export/trades")
    assert r.headers["content-type"].startswith("text/csv") and "attachment" in r.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(r.text)))
    assert len(rows) == len(saved["trades"])
    for row, t in zip(rows, saved["trades"]):
        assert float(row["net_pnl"]) == t["net_pnl"] and row["entry_date"] == t["entry_date"] and int(row["trade_no"]) == t["trade_no"]
    eq = list(csv.DictReader(io.StringIO(client.get(f"/api/v1/backtests/{rid}/export/equity").text)))
    assert len(eq) == len(saved["equity"]) and float(eq[-1]["equity"]) == saved["equity"][-1]["equity"]
    met = {m["metric"]: m for m in csv.DictReader(io.StringIO(client.get(f"/api/v1/backtests/{rid}/export/metrics").text))}
    assert float(met["final_equity"]["value"]) == saved["metrics"]["final_equity"]
    summary = client.get(f"/api/v1/backtests/{rid}/export/summary").text
    assert "metric.total_return_pct" in summary
    assert "'=cmd" in summary and ",=cmd" not in summary    # spreadsheet formula injection neutralised
    assert client.get(f"/api/v1/backtests/{rid}/export/secrets").status_code == 422
    assert client.get("/api/v1/backtests/9999/export/trades").status_code == 404


def test_null_metrics_are_explained_in_notes(client):
    iid = make_instrument(client)
    import_rows(client, iid, random_rows(60))
    res = _run(client, iid, strategy_type="buy_and_hold", params={})
    m = res["metrics"]
    assert m["win_rate_pct"] is None and "win_rate_pct" in m["notes"]
    assert m["profit_factor"] is None and "profit_factor" in m["notes"]
    saved = client.post("/api/v1/backtests", json=run_body(iid, strategy_type="buy_and_hold", params={})).json()
    assert saved["metrics"]["win_rate_pct"] is None and "win_rate_pct" in saved["metrics"]["notes"]


def test_compare_runs_all_strategies_and_isolates_failures(client, loaded):
    body = {"instrument_id": loaded["id"], "initial_capital": 100000, "fee_pct": 0.1,
            "strategies": [{"strategy_type": "buy_and_hold"}, {"strategy_type": "sma_crossover", "params": {"fast": 5, "slow": 20}},
                           {"strategy_type": "rsi_threshold"}, {"strategy_type": "sma_crossover", "params": {"fast": 40, "slow": 10}}]}
    r = client.post("/api/v1/backtests/compare", json=body)
    assert r.status_code == 200, r.text
    out = r.json()
    assert len(out["results"]) == 4 and len(out["benchmark"]) == 400
    assert out["results"][0]["error"] is None and out["results"][3]["error"]["code"] == "INVALID_PARAMETER"
    assert len(out["results"][1]["equity"]) == 400
    assert client.post("/api/v1/backtests/compare", json={**body, "strategies": []}).status_code == 422
    assert client.post("/api/v1/backtests/compare", json={**body, "strategies": [{"strategy_type": "buy_and_hold"}] * 7}).status_code == 422


def test_saved_strategies_lifecycle(client, loaded):
    r = client.post("/api/v1/saved-strategies", json={"name": "Fast SMA", "strategy_type": "sma_crossover", "params": {"fast": 5, "slow": 15}})
    assert r.status_code == 201 and r.json()["params"] == {"fast": 5, "slow": 15}
    sid = r.json()["id"]
    assert client.post("/api/v1/saved-strategies", json={"name": "Fast SMA", "strategy_type": "sma_crossover", "params": {}}).status_code == 409
    assert client.post("/api/v1/saved-strategies", json={"name": "Bad", "strategy_type": "sma_crossover", "params": {"fast": 50, "slow": 15}}).status_code == 422
    assert client.post("/api/v1/saved-strategies", json={"name": "Bad2", "strategy_type": "nope", "params": {}}).status_code == 422
    assert client.post("/api/v1/saved-strategies", json={"name": "  ", "strategy_type": "sma_crossover"}).status_code == 422
    assert len(client.get("/api/v1/saved-strategies").json()) == 1
    run = client.post("/api/v1/backtests", json=run_body(loaded["id"], params={"fast": 5, "slow": 15}, saved_strategy_id=sid)).json()
    assert run["saved_strategy_id"] == sid
    assert client.delete(f"/api/v1/saved-strategies/{sid}").status_code == 204   # run survives, link cleared
    assert client.get(f"/api/v1/backtests/{run['id']}").json()["saved_strategy_id"] is None
    assert client.delete(f"/api/v1/saved-strategies/{sid}").status_code == 404
    assert client.post("/api/v1/backtests", json=run_body(loaded["id"], saved_strategy_id=999)).status_code == 404


def test_deleting_instrument_with_saved_backtests_is_blocked(client, loaded):
    run = client.post("/api/v1/backtests", json=run_body(loaded["id"])).json()
    r = client.delete(f"/api/v1/instruments/{loaded['id']}")
    assert r.status_code == 409 and r.json()["error"]["code"] == "IN_USE"
    client.delete(f"/api/v1/backtests/{run['id']}")
    assert client.delete(f"/api/v1/instruments/{loaded['id']}").status_code == 204


def test_engine_unavailable_gives_503(loaded, client, provider):
    from fastapi.testclient import TestClient
    from app.core.deps import get_engine
    from app.integrations.engine_client import EngineClient
    from app.main import create_app

    app = create_app()
    app.dependency_overrides[get_engine] = lambda: EngineClient("/nonexistent/engine", 5)
    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.post("/api/v1/backtests/run", json=run_body(loaded["id"]))
        assert r.status_code == 503 and r.json()["error"]["code"] == "ENGINE_UNAVAILABLE"
        assert c.get("/api/v1/health").json()["engine"] == "unavailable"


def test_repeated_runs_are_deterministic(client, loaded):
    a, b = _run(client, loaded["id"]), _run(client, loaded["id"])
    assert a["metrics"] == b["metrics"] and a["trades"] == b["trades"] and a["equity"] == b["equity"]
