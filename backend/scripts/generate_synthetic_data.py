"""Generate SYNTHETIC demo candles (random numbers, NOT real market prices).

Writes data/sample/SYNTH-*.csv. The files are labelled synthetic in their names and the loader marks the
instruments `is_synthetic = TRUE`, so the UI shows a SYNTHETIC badge everywhere they appear.

    python -m scripts.generate_synthetic_data
"""
from __future__ import annotations

import math
import random
from datetime import date, timedelta
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "data" / "sample"

# name, start price, annual drift, annual volatility, mean-reversion strength (0 = pure random walk)
SERIES = [
    ("SYNTH-TREND", 1000.0, 0.18, 0.20, 0.0, 11),
    ("SYNTH-VOLATILE", 500.0, 0.05, 0.45, 0.0, 22),
    ("SYNTH-RANGE", 250.0, 0.0, 0.25, 0.06, 33),
]
START = date(2021, 1, 4)
DAYS = 780  # weekdays (~3 years)


def generate(start_price: float, mu: float, sigma: float, revert: float, seed: int) -> list[tuple]:
    rnd = random.Random(seed)
    rows, price, d, anchor = [], start_price, START, start_price
    dt = 1 / 252
    while len(rows) < DAYS:
        if d.weekday() < 5:
            shock = rnd.gauss(0, 1)
            drift = (mu - 0.5 * sigma ** 2) * dt
            pull = revert * math.log(anchor / price)
            close = price * math.exp(drift + pull + sigma * math.sqrt(dt) * shock)
            gap = rnd.gauss(0, sigma * math.sqrt(dt) * 0.25)
            open_ = price * math.exp(gap)
            wick_up, wick_dn = abs(rnd.gauss(0, sigma * math.sqrt(dt) * 0.4)), abs(rnd.gauss(0, sigma * math.sqrt(dt) * 0.4))
            high = max(open_, close) * math.exp(wick_up)
            low = min(open_, close) * math.exp(-wick_dn)
            o, h, l, c = (round(x, 2) for x in (open_, high, low, close))
            h, l = max(h, o, c), min(l, o, c)
            vol = int(rnd.lognormvariate(12.5, 0.4))
            rows.append((d.isoformat(), o, h, l, c, vol))
            price = c
        d += timedelta(days=1)
    return rows


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, p0, mu, sigma, revert, seed in SERIES:
        path = OUT / f"{name}.csv"
        rows = generate(p0, mu, sigma, revert, seed)
        with path.open("w", newline="") as f:
            f.write("Date,Open,High,Low,Close,Volume\n")
            for r in rows:
                f.write(",".join(str(x) for x in r) + "\n")
        print(f"wrote {path} ({len(rows)} rows) - SYNTHETIC")


if __name__ == "__main__":
    main()
