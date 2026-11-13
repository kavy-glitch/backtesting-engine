"""Instruments, CSV import, provider fetch, validation, error handling."""
from __future__ import annotations

from datetime import date

from tests.conftest import FakeProvider, import_rows, make_instrument, random_rows, rows_to_csv


def test_health_reports_database_and_engine(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" and body["database"] == "ok" and body["engine"] == "ok"
    assert body["engine_version"]


def test_strategy_catalogue_is_synced_from_engine(client):
    r = client.get("/api/v1/strategies")
    assert r.status_code == 200
    types = {s["type"]: s for s in r.json()}
    assert set(types) == {"buy_and_hold", "sma_crossover", "ema_crossover", "rsi_threshold", "macd_crossover"}
    assert {p["key"] for p in types["sma_crossover"]["params"]} == {"fast", "slow"}


def test_instrument_crud_and_conflicts(client):
    iid = make_instrument(client, "abc.ns")
    assert client.get(f"/api/v1/instruments/{iid}").json()["symbol"] == "ABC.NS"   # normalised to upper case
    assert client.post("/api/v1/instruments", json={"symbol": "ABC.NS"}).status_code == 409
    assert client.post("/api/v1/instruments", json={"symbol": "bad symbol!"}).status_code == 422
    assert client.post("/api/v1/instruments", json={"symbol": ""}).status_code == 422
    assert client.post("/api/v1/instruments", json={"symbol": "X", "currency": "RUPEES"}).status_code == 422
    assert client.get("/api/v1/instruments/9999").status_code == 404
    assert client.delete(f"/api/v1/instruments/{iid}").status_code == 204
    assert client.delete(f"/api/v1/instruments/{iid}").status_code == 404


def test_import_csv_success_skip_and_replace(client):
    iid = make_instrument(client)
    rows = random_rows(30)
    r = import_rows(client, iid, rows)
    assert r.status_code == 200
    assert (r.json()["rows_inserted"], r.json()["rows_skipped"]) == (30, 0)
    inst = client.get(f"/api/v1/instruments/{iid}").json()
    assert inst["candle_count"] == 30 and inst["first_date"] == str(rows[0]["date"])
    # same file again with mode=skip -> nothing inserted, nothing duplicated
    r = import_rows(client, iid, rows, mode="skip")
    assert (r.json()["rows_inserted"], r.json()["rows_skipped"]) == (0, 30)
    # replace overwrites existing rows
    changed = [dict(x, close=x["open"]) if i == 0 else x for i, x in enumerate(rows)]
    changed[0]["high"] = max(changed[0]["high"], changed[0]["open"])
    r = import_rows(client, iid, changed, mode="replace")
    assert (r.json()["rows_inserted"], r.json()["rows_updated"]) == (0, 30)
    assert client.get(f"/api/v1/instruments/{iid}").json()["candle_count"] == 30
    assert len(client.get(f"/api/v1/instruments/{iid}/imports").json()) == 3


def test_candles_endpoint_sorted_and_filterable(client, loaded):
    iid = loaded["id"]
    r = client.get(f"/api/v1/instruments/{iid}/candles")
    data = r.json()
    assert len(data) == 400
    assert [c["date"] for c in data] == sorted(c["date"] for c in data)
    mid = data[100]["date"]
    r2 = client.get(f"/api/v1/instruments/{iid}/candles", params={"start": mid, "end": data[199]["date"]})
    assert len(r2.json()) == 100
    assert client.get(f"/api/v1/instruments/{iid}/candles", params={"limit": 0}).status_code == 422


def _csv_post(client, iid, text):
    return client.post(f"/api/v1/instruments/{iid}/import-csv", files={"file": ("x.csv", text, "text/csv")})


def test_import_rejects_invalid_data_and_stores_nothing(client):
    iid = make_instrument(client)
    good = "Date,Open,High,Low,Close,Volume\n"
    cases = {
        "high below low": good + "2024-01-01,10,9,8,9,100\n",
        "negative price": good + "2024-01-01,-1,5,-2,1,100\n",
        "zero price": good + "2024-01-01,0,5,0,1,100\n",
        "negative volume": good + "2024-01-01,10,11,9,10,-5\n",
        "bad date": good + "01/02/2024,10,11,9,10,100\n",
        "impossible date": good + "2024-02-30,10,11,9,10,100\n",
        "non numeric": good + "2024-01-01,abc,11,9,10,100\n",
        "missing value": good + "2024-01-01,,11,9,10,100\n",
        "nan": good + "2024-01-01,nan,11,9,10,100\n",
        "duplicate date": good + "2024-01-01,10,11,9,10,100\n2024-01-01,10,11,9,10,100\n",
    }
    for name, text in cases.items():
        r = _csv_post(client, iid, text)
        assert r.status_code == 422, name
        err = r.json()["error"]
        assert err["code"] == "DATA_VALIDATION_FAILED", name
        assert err["details"][0]["row"] >= 2, name
    assert client.get(f"/api/v1/instruments/{iid}").json()["candle_count"] == 0   # nothing was stored


def test_import_reports_row_numbers_for_every_problem(client):
    iid = make_instrument(client)
    text = ("Date,Open,High,Low,Close,Volume\n2024-01-01,10,11,9,10,5\n2024-01-02,10,8,9,10,5\n"
            "2024-01-03,x,11,9,10,5\n2024-01-04,10,11,9,10,5\n")
    r = _csv_post(client, iid, text)
    rows = [d["row"] for d in r.json()["error"]["details"]]
    assert rows == [3, 4]
    assert client.get(f"/api/v1/instruments/{iid}").json()["candle_count"] == 0   # valid rows rejected too


def test_import_rejects_missing_columns_empty_and_non_utf8(client):
    iid = make_instrument(client)
    r = _csv_post(client, iid, "Date,Open,High,Low,Close\n2024-01-01,1,2,1,1\n")
    assert r.status_code == 422 and "volume" in r.json()["error"]["message"]
    assert _csv_post(client, iid, "").status_code == 422
    assert _csv_post(client, iid, "Date,Open,High,Low,Close,Volume\n").status_code == 422   # header only
    r = client.post(f"/api/v1/instruments/{iid}/import-csv", files={"file": ("x.csv", b"\xff\xfe\x00bad", "text/csv")})
    assert r.status_code == 422
    assert client.post("/api/v1/instruments/9999/import-csv", files={"file": ("x.csv", "a", "text/csv")}).status_code == 404


def test_import_sorts_unsorted_rows_with_an_explicit_warning(client):
    iid = make_instrument(client)
    text = "Date,Open,High,Low,Close,Volume\n2024-01-03,10,11,9,10,5\n2024-01-02,10,11,9,10,5\n2024-01-01,10,11,9,10,5\n"
    r = _csv_post(client, iid, text)
    assert r.status_code == 200
    assert any("sorted" in w for w in r.json()["warnings"])
    assert [c["date"] for c in client.get(f"/api/v1/instruments/{iid}/candles").json()] == ["2024-01-01", "2024-01-02", "2024-01-03"]


def test_import_warns_about_gaps_and_accepts_timestamps_and_extra_columns(client):
    iid = make_instrument(client)
    text = ("Date,Open,High,Low,Close,Adj Close,Volume\n2024-01-01 00:00:00+05:30,10,11,9,10,10,5\n"
            "2024-03-01,10,11,9,10,10,5\n")
    r = _csv_post(client, iid, text)
    assert r.status_code == 200
    assert any("Gap of" in w for w in r.json()["warnings"])


def test_database_trigger_blocks_future_dates(client):
    iid = make_instrument(client)
    r = _csv_post(client, iid, "Date,Open,High,Low,Close,Volume\n2099-01-01,10,11,9,10,5\n")
    assert r.status_code == 422 and "future" in r.json()["error"]["message"]
    assert client.get(f"/api/v1/instruments/{iid}").json()["candle_count"] == 0


def test_fetch_symbol_creates_instrument_and_imports(client, provider):
    r = client.post("/api/v1/instruments/fetch-symbol",
                    json={"symbol": "reliance.ns", "start_date": "2023-01-01", "end_date": "2023-06-30"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["instrument"]["symbol"] == "RELIANCE.NS" and body["instrument"]["exchange"] == "NSE"
    assert body["rows_inserted"] == 60
    assert provider.calls[0][0] == "RELIANCE.NS"
    # fetching again updates instead of duplicating
    r2 = client.post("/api/v1/instruments/fetch-symbol",
                     json={"symbol": "RELIANCE.NS", "start_date": "2023-01-01", "end_date": "2023-06-30"})
    assert r2.json()["rows_inserted"] == 0 and r2.json()["rows_updated"] == 60


def test_fetch_provider_failure_creates_nothing(client, provider):
    provider.error = "No data returned for 'NOPE'"
    r = client.post("/api/v1/instruments/fetch-symbol", json={"symbol": "NOPE", "start_date": "2023-01-01", "end_date": "2023-02-01"})
    assert r.status_code == 502 and r.json()["error"]["code"] == "PROVIDER_ERROR"
    assert client.get("/api/v1/instruments").json() == []


def test_fetch_provider_returning_bad_prices_is_rejected(client, provider):
    bad = random_rows(10)
    bad[3]["high"] = 0.01
    provider.rows = bad
    iid = make_instrument(client)
    r = client.post(f"/api/v1/instruments/{iid}/fetch", json={"start_date": "2023-01-01", "end_date": "2023-02-01"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "DATA_VALIDATION_FAILED"
    assert client.get(f"/api/v1/instruments/{iid}").json()["candle_count"] == 0


def test_fetch_request_validation(client):
    iid = make_instrument(client)
    assert client.post(f"/api/v1/instruments/{iid}/fetch", json={"start_date": "2023-02-01", "end_date": "2023-01-01"}).status_code == 422
    assert client.post(f"/api/v1/instruments/{iid}/fetch", json={"start_date": "nope", "end_date": "2023-01-01"}).status_code == 422
    assert client.post(f"/api/v1/instruments/{iid}/fetch", json={}).status_code == 422


def test_error_shape_is_consistent_and_leaks_nothing(client):
    r = client.get("/api/v1/instruments/abc")
    assert r.status_code == 422
    assert set(r.json()["error"]) == {"code", "message", "details"}
    r = client.get("/api/v1/does-not-exist")
    assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"
    r = client.put("/api/v1/instruments")
    assert r.status_code == 405


def test_unhandled_exception_returns_generic_500_without_traceback(client):
    from app.main import create_app
    from app.core.db import get_db
    from fastapi.testclient import TestClient

    app = create_app()

    def boom():
        raise RuntimeError("secret internal detail /etc/passwd")
        yield

    app.dependency_overrides[get_db] = boom
    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.get("/api/v1/instruments")
    assert r.status_code == 500
    text = r.text
    assert "secret internal detail" not in text and "Traceback" not in text
    assert r.json()["error"]["code"] == "INTERNAL_ERROR"


def test_database_down_gives_503_not_a_crash(monkeypatch):
    from fastapi.testclient import TestClient
    from app.core.config import get_settings
    from app.main import create_app

    monkeypatch.setenv("PBE_DB_PORT", "1")   # nothing listens here
    get_settings.cache_clear()
    try:
        with TestClient(create_app(), raise_server_exceptions=False) as c:
            r = c.get("/api/v1/instruments")
            assert r.status_code == 503 and r.json()["error"]["code"] == "DATABASE_UNAVAILABLE"
            assert c.get("/api/v1/health").json()["status"] == "degraded"
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()


def test_cors_allows_the_frontend_origin(client):
    r = client.options("/api/v1/instruments", headers={"Origin": "http://localhost:5173",
                                                       "Access-Control-Request-Method": "GET"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"
