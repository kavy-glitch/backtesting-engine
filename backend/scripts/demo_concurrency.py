"""Live demonstration of transactions, locking and deadlock handling (for the DBMS viva).

    python -m scripts.demo_concurrency

Uses two real MySQL sessions and two temporary rows in `instruments` (removed afterwards)."""
from __future__ import annotations

import threading

import pymysql

from app.core.config import get_settings
from app.core.db import connect


def main() -> None:
    s = get_settings()
    admin = connect(s)
    with admin.cursor() as cur:
        cur.execute("DELETE FROM instruments WHERE symbol IN ('DEMO-A', 'DEMO-B')")
        cur.execute("INSERT INTO instruments (symbol) VALUES ('DEMO-A'), ('DEMO-B')")
        cur.execute("SELECT id FROM instruments WHERE symbol IN ('DEMO-A','DEMO-B') ORDER BY symbol")
        a_id, b_id = [r["id"] for r in cur.fetchall()]
    admin.commit()

    print("== 1. Isolation (REPEATABLE READ): a reader keeps its snapshot ==")
    t1, t2 = connect(s), connect(s)
    c1, c2 = t1.cursor(), t2.cursor()
    c1.execute("SELECT name FROM instruments WHERE id = %s", (a_id,)); print("T1 reads name:", c1.fetchone()["name"])
    c2.execute("UPDATE instruments SET name = 'changed by T2' WHERE id = %s", (a_id,)); t2.commit()
    c1.execute("SELECT name FROM instruments WHERE id = %s", (a_id,)); print("T1 reads again (T2 already committed):", c1.fetchone()["name"], " <- same snapshot")
    t1.commit(); c1.execute("SELECT name FROM instruments WHERE id = %s", (a_id,)); print("T1 new transaction sees:", c1.fetchone()["name"])
    t1.commit(); t1.close(); t2.close()

    print("\n== 2. Deadlock: two transactions lock the same rows in opposite order ==")
    ready = [threading.Event(), threading.Event()]
    result: dict[str, str] = {}

    def worker(name, first, second, mine, other):
        db = connect(s)
        try:
            with db.cursor() as cur:
                cur.execute("UPDATE instruments SET name = %s WHERE id = %s", (name, first)); print(f"{name} locked row {first}")
                mine.set(); other.wait(5)
                cur.execute("UPDATE instruments SET name = %s WHERE id = %s", (name, second))
            db.commit(); result[name] = "COMMITTED"
        except pymysql.err.OperationalError as exc:
            db.rollback(); result[name] = f"ROLLED BACK by MySQL (error {exc.args[0]}: deadlock victim)"
        finally:
            db.close()

    th = [threading.Thread(target=worker, args=("T1", a_id, b_id, ready[0], ready[1])),
          threading.Thread(target=worker, args=("T2", b_id, a_id, ready[1], ready[0]))]
    [t.start() for t in th]; [t.join() for t in th]
    for k, v in sorted(result.items()):
        print(f"{k}: {v}")
    print("InnoDB detected the cycle, rolled one transaction back (atomicity) and let the other finish.")

    with admin.cursor() as cur:
        cur.execute("DELETE FROM instruments WHERE symbol IN ('DEMO-A', 'DEMO-B')")
    admin.commit(); admin.close()
    print("\n(temporary rows removed)")


if __name__ == "__main__":
    main()
