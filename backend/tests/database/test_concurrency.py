"""Transactions, isolation, locking and deadlocks, exercised with real concurrent MySQL sessions."""
from __future__ import annotations

import threading

import pymysql
import pytest

from tests.conftest import ADMIN, HOST, PORT, TEST_DB, admin_connect, make_instrument, random_rows

def conn():
   return pymysql.connect(host=HOST, port=PORT, user=ADMIN[0], password=ADMIN[1], database=TEST_DB,
                           cursorclass=pymysql.cursors.DictCursor, autocommit=False)


def _setup_two_instruments():
    c = admin_connect(TEST_DB)
    with c.cursor() as cur:
        cur.execute("INSERT INTO instruments (symbol) VALUES ('AAA'), ('BBB')")
        cur.execute("SELECT id FROM instruments ORDER BY symbol")
        ids = [r["id"] for r in cur.fetchall()]
    c.close()
    return ids


def test_repeatable_read_snapshot_and_no_dirty_reads():
    a, b = conn(), conn()
    ca, cb = a.cursor(), b.cursor()
    ca.execute("SELECT COUNT(*) AS n FROM instruments"); assert ca.fetchone()["n"] == 0   # A's snapshot starts
    cb.execute("INSERT INTO instruments (symbol) VALUES ('NEW')")                          # B: not yet committed
    ca.execute("SELECT COUNT(*) AS n FROM instruments"); assert ca.fetchone()["n"] == 0   # no dirty read
    b.commit()
    ca.execute("SELECT COUNT(*) AS n FROM instruments"); assert ca.fetchone()["n"] == 0   # repeatable read: same snapshot
    a.commit()
    ca.execute("SELECT COUNT(*) AS n FROM instruments"); assert ca.fetchone()["n"] == 1   # new transaction sees it
    a.close(); b.close()


def test_select_for_update_prevents_lost_updates():
    c = admin_connect(TEST_DB)
    with c.cursor() as cur:
        cur.execute("INSERT INTO saved_strategies (name, strategy_type_id) VALUES ('ctr', (SELECT id FROM strategy_types LIMIT 1))")
        sid = cur.lastrowid
        cur.execute("INSERT INTO saved_strategy_params VALUES (%s, 'counter', 0)", (sid,))
    c.close()
    workers, loops, errors = 8, 15, []

    def work():
        db = conn()
        try:
            for _ in range(loops):
                with db.cursor() as cur:
                    cur.execute("SELECT param_value FROM saved_strategy_params WHERE saved_strategy_id=%s AND param_key='counter' FOR UPDATE", (sid,))
                    v = cur.fetchone()["param_value"]
                    cur.execute("UPDATE saved_strategy_params SET param_value=%s WHERE saved_strategy_id=%s AND param_key='counter'", (v + 1, sid))
                db.commit()
        except Exception as exc:  # pragma: no cover
            errors.append(exc)
        finally:
            db.close()

    ts = [threading.Thread(target=work) for _ in range(workers)]
    [t.start() for t in ts]; [t.join() for t in ts]
    assert not errors
    c = admin_connect(TEST_DB)
    with c.cursor() as cur:
        cur.execute("SELECT param_value FROM saved_strategy_params WHERE saved_strategy_id=%s", (sid,))
        assert cur.fetchone()["param_value"] == workers * loops     # no update was lost
    c.close()


def test_deadlock_is_detected_and_one_transaction_is_rolled_back():
    a_id, b_id = _setup_two_instruments()
    got_first = [threading.Event(), threading.Event()]
    outcome = {}

    def tx(name, first, second, my_event, other_event):
        db = conn()
        try:
            with db.cursor() as cur:
                cur.execute("UPDATE instruments SET name=%s WHERE id=%s", (name, first))   # lock #1
                my_event.set()
                other_event.wait(5)
                cur.execute("UPDATE instruments SET name=%s WHERE id=%s", (name, second))  # lock #2 -> cycle
            db.commit()
            outcome[name] = "committed"
        except pymysql.err.OperationalError as exc:
            outcome[name] = exc.args[0]
            db.rollback()
        finally:
            db.close()

    t1 = threading.Thread(target=tx, args=("T1", a_id, b_id, got_first[0], got_first[1]))
    t2 = threading.Thread(target=tx, args=("T2", b_id, a_id, got_first[1], got_first[0]))
    t1.start(); t2.start(); t1.join(30); t2.join(30)
    assert sorted(map(str, outcome.values())) == sorted(["1213", "committed"]), outcome    # one victim, one winner
    victim = [k for k, v in outcome.items() if v == 1213][0]
    c = admin_connect(TEST_DB)
    with c.cursor() as cur:
        cur.execute("SELECT name FROM instruments WHERE name = %s", (victim,))
        assert not cur.fetchall()                    # the victim's partial work was undone (atomicity)
    c.close()


def test_concurrent_imports_never_create_duplicates(client):
    from app import repositories as repo
    iid = make_instrument(client)
    rows = random_rows(120)
    errors = []

    def imp():
        db = conn()
        try:
            repo.import_candles(db, iid, rows, source="csv", file_name="t.csv", mode="replace")
        except Exception as exc:  # pragma: no cover
            errors.append(exc)
        finally:
            db.close()

    ts = [threading.Thread(target=imp) for _ in range(4)]
    [t.start() for t in ts]; [t.join(60) for t in ts]
    assert not errors, errors
    assert client.get(f"/api/v1/instruments/{iid}").json()["candle_count"] == 120    # primary key blocks duplicates


def test_two_users_saving_backtests_at_once(client, loaded):
    from tests.conftest import run_body
    results, errors = [], []

    def save(i):
        r = client.post("/api/v1/backtests", json=run_body(loaded["id"], name=f"c{i}", params={"fast": 3 + i, "slow": 20}))
        (results if r.status_code == 201 else errors).append(r.status_code)

    ts = [threading.Thread(target=save, args=(i,)) for i in range(4)]
    [t.start() for t in ts]; [t.join(120) for t in ts]
    assert not errors and len(results) == 4
    assert client.get("/api/v1/backtests").json()["total"] == 4
