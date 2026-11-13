"""Test fixtures. Tests run against a REAL MySQL server (database `pbe_test`) and the REAL compiled
C++ engine - there are no mocks for either. Only the market-data provider is replaced by a stand-in.

Environment:
  PBE_ENGINE_PATH            path to the compiled engine executable (required)
  PBE_TEST_DB_HOST/PORT      MySQL location (default 127.0.0.1:3306)
  PBE_TEST_ADMIN_USER/PASSWORD   an account allowed to create databases and users (default root / empty)
"""
from __future__ import annotations

import os
import random
import sys
from datetime import date, timedelta
from pathlib import Path

import pymysql
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

TEST_DB = "pbe_test"
APP_USER, APP_PW = "pbe_app_test", "app-test-pw"
RO_USER, RO_PW = "pbe_ro_test", "ro-test-pw"

HOST = os.environ.get("PBE_TEST_DB_HOST", "127.0.0.1")
PORT = int(os.environ.get("PBE_TEST_DB_PORT", "3306"))
ADMIN = (os.environ.get("PBE_TEST_ADMIN_USER", "root"), os.environ.get("PBE_TEST_ADMIN_PASSWORD", ""))

os.environ.update({"PBE_DB_HOST": HOST, "PBE_DB_PORT": str(PORT), "PBE_DB_NAME": TEST_DB,
                   "PBE_DB_USER": APP_USER, "PBE_DB_PASSWORD": APP_PW})
if "PBE_ENGINE_PATH" not in os.environ:
    for cand in (ROOT / "engine" / "build" / "engine", ROOT / "engine" / "build" / "Release" / "engine.exe"):
        if cand.exists():
            os.environ["PBE_ENGINE_PATH"] = str(cand)


def admin_connect(database: str | None = None):
    return pymysql.connect(host=HOST, port=PORT, user=ADMIN[0], password=ADMIN[1], database=database,
                           charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor, autocommit=True)


@pytest.fixture(scope="session", autouse=True)
def database():
    from app.core.db_init import apply_schema
    c = admin_connect()
    with c.cursor() as cur:
        cur.execute(f"DROP DATABASE IF EXISTS {TEST_DB}")
        cur.execute(f"CREATE DATABASE {TEST_DB} CHARACTER SET utf8mb4")
        for user, pw in ((APP_USER, APP_PW), (RO_USER, RO_PW)):
            cur.execute(f"CREATE USER IF NOT EXISTS '{user}'@'%%' IDENTIFIED BY %s", (pw,))
        # same least-privilege grants as database/02_security.sh
        cur.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON {TEST_DB}.* TO '{APP_USER}'@'%'")
        cur.execute(f"GRANT SELECT ON {TEST_DB}.* TO '{RO_USER}'@'%'")
    c.close()
    c = admin_connect(TEST_DB)
    apply_schema(c, ROOT / "database" / "schema.sql")
    c.close()
    from app.core.config import get_settings
    get_settings.cache_clear()
    yield


@pytest.fixture(autouse=True)
def clean_tables(database):
    yield
    c = admin_connect(TEST_DB)
    with c.cursor() as cur:
        cur.execute("SET FOREIGN_KEY_CHECKS = 0")
        for t in ("run_messages", "indicator_values", "indicator_series", "equity_points", "trades", "backtest_metrics",
                  "backtest_run_params", "backtest_runs", "saved_strategy_params", "saved_strategies", "candles",
                  "import_batches", "instruments"):
            cur.execute(f"TRUNCATE TABLE {t}")
        cur.execute("SET FOREIGN_KEY_CHECKS = 1")
    c.close()


@pytest.fixture()
def admin_db():
    c = admin_connect(TEST_DB)
    yield c
    c.close()


@pytest.fixture()
def app_db():
    from app.core.config import get_settings
    from app.core.db import connect
    c = connect(get_settings())
    yield c
    c.close()


class FakeProvider:
    """Stand-in for Yahoo Finance: deterministic, offline."""
    name = "yfinance"

    def __init__(self, rows=None, error=None, warnings=None):
        self.rows, self.error, self.warnings = rows, error, warnings or []
        self.calls = []

    def fetch_daily(self, symbol, start, end):
        from app.integrations.providers import ProviderError
        self.calls.append((symbol, start, end))
        if self.error:
            raise ProviderError(self.error)
        rows = self.rows if self.rows is not None else random_rows(60, start)
        return rows, list(self.warnings)


@pytest.fixture()
def provider():
    return FakeProvider()


@pytest.fixture()
def client(provider):
    from app.main import create_app
    from app.integrations.providers import get_provider
    app = create_app()
    app.dependency_overrides[get_provider] = lambda: provider
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


# ---------------------------------------------------------------- data helpers
def random_rows(n: int, start: date = date(2023, 1, 2), seed: int = 5, base: float = 100.0) -> list[dict]:
    """Random-walk OHLCV on weekdays (TEST data only)."""
    rnd = random.Random(seed)
    rows, p, d = [], base, start
    while len(rows) < n:
        if d.weekday() < 5:
            o = p
            c = round(p * (1 + rnd.uniform(-0.03, 0.03)), 2)
            h = round(max(o, c) * 1.005, 2)
            l = round(min(o, c) * 0.995, 2)
            rows.append({"date": d, "open": o, "high": h, "low": l, "close": c, "volume": rnd.randint(1000, 90000),
                         "_row": len(rows) + 2})
            p = c
        d += timedelta(days=1)
    return rows


def rows_to_csv(rows: list[dict]) -> str:
    lines = ["Date,Open,High,Low,Close,Volume"]
    for r in rows:
        lines.append(f"{r['date']},{r['open']},{r['high']},{r['low']},{r['close']},{r['volume']}")
    return "\n".join(lines) + "\n"


def make_instrument(client, symbol="TEST.NS") -> int:
    r = client.post("/api/v1/instruments", json={"symbol": symbol, "name": "Test Co", "currency": "INR"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def import_rows(client, instrument_id: int, rows: list[dict], mode="skip"):
    return client.post(f"/api/v1/instruments/{instrument_id}/import-csv?mode={mode}",
                       files={"file": ("data.csv", rows_to_csv(rows), "text/csv")})


@pytest.fixture()
def loaded(client):
    """An instrument with 400 weekday candles."""
    iid = make_instrument(client)
    rows = random_rows(400)
    r = import_rows(client, iid, rows)
    assert r.status_code == 200, r.text
    return {"id": iid, "rows": rows}


def run_body(iid: int, **over) -> dict:
    body = {"instrument_id": iid, "strategy_type": "sma_crossover", "params": {"fast": 5, "slow": 20},
            "initial_capital": 100000, "fee_pct": 0.1, "slippage_bps": 5}
    body.update(over)
    return body
