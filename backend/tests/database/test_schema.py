"""Database layer: constraints, keys, triggers, cascade/restrict, transactions, procedures, privileges."""
from __future__ import annotations

import pymysql
import pytest

from tests.conftest import (APP_PW, APP_USER, HOST, PORT, RO_PW, RO_USER, TEST_DB, import_rows, make_instrument,
                       random_rows, run_body)


def _inst(db, symbol="DB.NS"):
    with db.cursor() as cur:
        cur.execute("INSERT INTO instruments (symbol) VALUES (%s)", (symbol,))
        return cur.lastrowid


def _insert_candle(db, iid, d="2024-01-02", o=10, h=11, l=9, c=10, v=100):
    with db.cursor() as cur:
        cur.execute("INSERT INTO candles (instrument_id, trade_date, open, high, low, close, volume) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                    (iid, d, o, h, l, c, v))


def _code(exc_info):
    return exc_info.value.args[0]


def test_record_creation_and_read_back(admin_db):
    iid = _inst(admin_db)
    _insert_candle(admin_db, iid)
    with admin_db.cursor() as cur:
        cur.execute("SELECT open, volume FROM candles WHERE instrument_id = %s", (iid,))
        row = cur.fetchone()
    assert float(row["open"]) == 10 and float(row["volume"]) == 100


def test_foreign_key_is_enforced(admin_db):
    with pytest.raises(pymysql.err.IntegrityError) as e:
        _insert_candle(admin_db, 424242)
    assert _code(e) == 1452
    with pytest.raises(pymysql.err.IntegrityError) as e:
        with admin_db.cursor() as cur:
            cur.execute("INSERT INTO saved_strategies (name, strategy_type_id) VALUES ('x', 99999)")
    assert _code(e) == 1452


def test_unique_constraints(admin_db):
    iid = _inst(admin_db)
    with pytest.raises(pymysql.err.IntegrityError) as e:
        _inst(admin_db)                       # duplicate symbol
    assert _code(e) == 1062
    _insert_candle(admin_db, iid)
    with pytest.raises(pymysql.err.IntegrityError) as e:
        _insert_candle(admin_db, iid)         # same instrument + timeframe + date
    assert _code(e) == 1062
    _insert_candle(admin_db, iid, d="2024-01-03")   # different date is fine


@pytest.mark.parametrize("kwargs", [
    dict(h=8, l=9), dict(o=-1, h=5, l=-2, c=1), dict(o=0, h=5, l=0, c=1), dict(h=9.5, o=10, c=10, l=9), dict(v=-1),
    dict(l=10.5),
])
def test_candle_check_constraints_reject_impossible_prices(admin_db, kwargs):
    iid = _inst(admin_db)
    with pytest.raises(pymysql.err.MySQLError) as e:
        _insert_candle(admin_db, iid, **kwargs)
    assert _code(e) == 3819   # CHECK constraint violated


def test_not_null_constraints(admin_db):
    with pytest.raises((pymysql.err.IntegrityError, pymysql.err.OperationalError)) as e:
        with admin_db.cursor() as cur:
            cur.execute("INSERT INTO instruments (symbol) VALUES (NULL)")
    assert _code(e) == 1048
    iid = _inst(admin_db)
    with pytest.raises(pymysql.err.MySQLError):
        with admin_db.cursor() as cur:
            cur.execute("INSERT INTO candles (instrument_id, trade_date, open, high, low, close) VALUES (%s,'2024-01-02',1,2,1,1)", (iid,))


def test_trigger_rejects_candles_dated_in_the_future(admin_db):
    iid = _inst(admin_db)
    with pytest.raises(pymysql.err.OperationalError) as e:
        _insert_candle(admin_db, iid, d="2099-01-01")
    assert _code(e) == 1644 and "future" in e.value.args[1]
    _insert_candle(admin_db, iid, d="2024-01-02")
    with pytest.raises(pymysql.err.OperationalError) as e:      # also blocked on UPDATE
        with admin_db.cursor() as cur:
            cur.execute("UPDATE candles SET trade_date = '2099-01-01' WHERE instrument_id = %s", (iid,))
    assert _code(e) == 1644


def _counts(db, run_id):
    tables = ["backtest_run_params", "backtest_metrics", "trades", "equity_points", "indicator_series", "run_messages"]
    out = {}
    with db.cursor() as cur:
        for t in tables:
            cur.execute(f"SELECT COUNT(*) AS n FROM {t} WHERE run_id = %s", (run_id,))
            out[t] = cur.fetchone()["n"]
        cur.execute("SELECT COUNT(*) AS n FROM indicator_values v JOIN indicator_series s ON s.id = v.series_id WHERE s.run_id = %s", (run_id,))
        out["indicator_values"] = cur.fetchone()["n"]
    return out


def test_delete_behaviour_cascade_and_restrict(client, loaded, admin_db):
    run = client.post("/api/v1/backtests", json=run_body(loaded["id"])).json()
    before = _counts(admin_db, run["id"])
    assert all(v > 0 for k, v in before.items() if k != "run_messages")
    with pytest.raises(pymysql.err.IntegrityError):             # RESTRICT: instrument has a run
        with admin_db.cursor() as cur:
            cur.execute("DELETE FROM instruments WHERE id = %s", (loaded["id"],))
    with admin_db.cursor() as cur:                              # CASCADE: deleting the run removes every child row
        cur.execute("DELETE FROM backtest_runs WHERE id = %s", (run["id"],))
    assert all(v == 0 for v in _counts(admin_db, run["id"]).values())
    with admin_db.cursor() as cur:                              # CASCADE: instrument -> candles, import batches
        cur.execute("DELETE FROM instruments WHERE id = %s", (loaded["id"],))
        cur.execute("SELECT COUNT(*) AS n FROM candles WHERE instrument_id = %s", (loaded["id"],))
        assert cur.fetchone()["n"] == 0
        cur.execute("SELECT COUNT(*) AS n FROM import_batches WHERE instrument_id = %s", (loaded["id"],))
        assert cur.fetchone()["n"] == 0


def test_strategy_type_in_use_cannot_be_deleted(client, loaded, admin_db):
    client.post("/api/v1/backtests", json=run_body(loaded["id"]))
    with pytest.raises(pymysql.err.IntegrityError):
        with admin_db.cursor() as cur:
            cur.execute("DELETE FROM strategy_types WHERE type_key = 'sma_crossover'")


def test_save_is_atomic_all_or_nothing(client, loaded, app_db, admin_db):
    """If any statement of a save fails, NOTHING from that save may remain (ACID atomicity)."""
    from app import repositories as repo
    from app import services
    from app.core.config import get_settings
    from app.integrations.engine_client import EngineClient
    from app.api.schemas import BacktestIn

    s = get_settings()
    cfg = BacktestIn(**run_body(loaded["id"]))
    resp = services.execute(app_db, EngineClient(s.engine_path), s, cfg)
    res = resp.pop("_engine_result")
    assert len(res["trades"]) >= 2
    res["trades"][-1]["quantity"] = 0             # violates ck_trades_qty on the trades insert (after run/metrics rows)
    stype = repo.get_strategy_type(app_db, "sma_crossover")
    with pytest.raises(pymysql.err.MySQLError):
        repo.save_run(app_db, name="broken", instrument_id=loaded["id"], strategy_type_id=stype["id"], saved_strategy_id=None,
                      start=resp["period"]["start"], end=resp["period"]["end"], cfg=resp["config"],
                      engine_version="1.0.0", strategy_params=resp["strategy"]["params"], result=res)
    with admin_db.cursor() as cur:
        for t in ("backtest_runs", "backtest_metrics", "backtest_run_params", "trades", "equity_points"):
            cur.execute(f"SELECT COUNT(*) AS n FROM {t}")
            assert cur.fetchone()["n"] == 0, t
    # and the connection is still usable afterwards
    assert client.post("/api/v1/backtests", json=run_body(loaded["id"])).status_code == 201


def test_committed_data_survives_new_connections(client, loaded):
    run = client.post("/api/v1/backtests", json=run_body(loaded["id"], name="persist me")).json()
    fresh = pymysql.connect(host=HOST, port=PORT, user=APP_USER, password=APP_PW, database=TEST_DB,
                            cursorclass=pymysql.cursors.DictCursor)
    with fresh.cursor() as cur:
        cur.execute("SELECT name FROM backtest_runs WHERE id = %s", (run["id"],))
        assert cur.fetchone()["name"] == "persist me"
    fresh.close()


def test_stored_procedure_verifies_trades_against_metrics(client, loaded, app_db, admin_db):
    run = client.post("/api/v1/backtests", json=run_body(loaded["id"])).json()
    with app_db.cursor() as cur:       # the app account holds EXECUTE
        cur.execute("CALL sp_verify_run_integrity(%s, @ok, @msg)", (run["id"],))
        cur.execute("SELECT @ok AS ok, @msg AS msg")
        row = cur.fetchone()
    assert row["ok"] == 1 and "agree" in row["msg"]
    with admin_db.cursor() as cur:     # tamper with one stored trade
        cur.execute("UPDATE trades SET net_pnl = net_pnl + 1 WHERE run_id = %s AND status = 'closed' LIMIT 1", (run["id"],))
        cur.execute("CALL sp_verify_run_integrity(%s, @ok, @msg)", (run["id"],))
        cur.execute("SELECT @ok AS ok, @msg AS msg")
        row = cur.fetchone()
    assert row["ok"] == 0 and "mismatch" in row["msg"]
    with admin_db.cursor() as cur:
        cur.execute("CALL sp_verify_run_integrity(99999, @ok, @msg)")
        cur.execute("SELECT @ok AS ok, @msg AS msg")
        assert cur.fetchone()["msg"] == "run not found"


def test_function_and_view(client, loaded, admin_db):
    with admin_db.cursor() as cur:
        cur.execute("SELECT fn_return_pct(100, 125) AS a, fn_return_pct(0, 5) AS b, fn_return_pct(NULL, 5) AS c")
        r = cur.fetchone()
    assert r["a"] == 25 and r["b"] is None and r["c"] is None
    run = client.post("/api/v1/backtests", json=run_body(loaded["id"])).json()
    with admin_db.cursor() as cur:
        cur.execute("SELECT * FROM v_run_summary WHERE run_id = %s", (run["id"],))
        v = cur.fetchone()
        cur.execute("SELECT COUNT(*) AS n FROM v_trade_detail WHERE run_id = %s", (run["id"],))
        n = cur.fetchone()["n"]
    assert v["symbol"] == "TEST.NS" and v["total_return_pct"] == pytest.approx(run["metrics"]["total_return_pct"])
    assert n == len(run["trades"])


def test_least_privilege_accounts(app_db):
    with app_db.cursor() as cur:
        with pytest.raises(pymysql.err.OperationalError) as e:
            cur.execute("DROP TABLE trades")
        assert _code(e) == 1142
        with pytest.raises(pymysql.err.OperationalError):
            cur.execute("ALTER TABLE trades ADD COLUMN hacked INT")
        with pytest.raises(pymysql.err.OperationalError):
            cur.execute("CREATE USER 'evil'@'%' IDENTIFIED BY 'x'")
    ro = pymysql.connect(host=HOST, port=PORT, user=RO_USER, password=RO_PW, database=TEST_DB, cursorclass=pymysql.cursors.DictCursor)
    with ro.cursor() as cur:
        cur.execute("SELECT COUNT(*) AS n FROM instruments")
        with pytest.raises(pymysql.err.OperationalError) as e:
            cur.execute("INSERT INTO instruments (symbol) VALUES ('NOPE')")
        assert _code(e) == 1142
        with pytest.raises(pymysql.err.OperationalError):
            cur.execute("DELETE FROM instruments")
    ro.close()


def test_sql_injection_attempts_are_inert(client, loaded, admin_db):
    r = client.post("/api/v1/instruments", json={"symbol": "X'; DROP TABLE instruments;--"})
    assert r.status_code == 422                                  # rejected by schema pattern
    r = client.get("/api/v1/backtests", params={"strategy_type": "x' OR '1'='1"})
    assert r.status_code == 200 and r.json()["total"] == 0       # bound as a value, matches nothing
    r = client.post("/api/v1/instruments", json={"symbol": "SAFE", "name": "Robert'); DROP TABLE candles;--"})
    assert r.status_code == 201 and r.json()["name"].startswith("Robert")    # stored literally as text
    with admin_db.cursor() as cur:
        cur.execute("SHOW TABLES LIKE 'candles'")
        assert cur.fetchone() is not None


def test_queries_use_indexes(client, loaded, admin_db):
    run = client.post("/api/v1/backtests", json=run_body(loaded["id"])).json()
    with admin_db.cursor() as cur:
        cur.execute("EXPLAIN SELECT * FROM candles WHERE instrument_id = %s AND timeframe = '1d' AND trade_date BETWEEN '2023-02-01' AND '2023-03-01'", (loaded["id"],))
        plan = cur.fetchone()
        assert plan["key"] == "PRIMARY" and plan["type"] == "range"
        cur.execute("EXPLAIN SELECT * FROM trades WHERE run_id = %s ORDER BY entry_date", (run["id"],))
        # a table with a handful of rows may be scanned directly, so check the index is *available* to the optimizer
        assert "idx_trades_run_entry" in cur.fetchone()["possible_keys"]
        cur.execute("EXPLAIN SELECT * FROM backtest_runs WHERE instrument_id = %s ORDER BY created_at DESC", (loaded["id"],))
        assert cur.fetchone()["key"] == "idx_runs_instrument_created"
