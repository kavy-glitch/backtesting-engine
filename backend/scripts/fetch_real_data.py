"""Download REAL daily prices from Yahoo Finance (needs internet) into the database.

    python -m scripts.fetch_real_data RELIANCE.NS TCS.NS INFY.NS --start 2019-01-01
    python -m scripts.fetch_real_data ^NSEI --name "Nifty 50" --asset-class index
    python -m scripts.fetch_real_data AAPL --currency USD --save-csv data/real

Prices are split/dividend adjusted. yfinance is an unofficial library for personal/educational use."""
from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path

from app.services import candle_validation as cv
from app import repositories as repo
from app.core.config import get_settings
from app.core.db import connect
from app.integrations.providers import ProviderError, YahooFinanceProvider


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("symbols", nargs="+")
    ap.add_argument("--start", default="2019-01-01")
    ap.add_argument("--end", default=date.today().isoformat())
    ap.add_argument("--name")
    ap.add_argument("--currency", default="INR")
    ap.add_argument("--asset-class", default="equity", choices=["equity", "index", "crypto", "other"])
    ap.add_argument("--save-csv", metavar="DIR", help="also write each series to DIR/<symbol>.csv (offline backup)")
    a = ap.parse_args()
    provider, conn = YahooFinanceProvider(), connect(get_settings())
    failures = 0
    for symbol in (s.upper() for s in a.symbols):
        try:
            rows, warns = provider.fetch_daily(symbol, date.fromisoformat(a.start), date.fromisoformat(a.end))
        except ProviderError as exc:
            print(f"{symbol}: FAILED - {exc}")
            failures += 1
            continue
        rep = cv.validate_rows(rows)
        if not rep.ok:
            print(f"{symbol}: FAILED validation - {rep.errors[:3]}")
            failures += 1
            continue
        inst = repo.find_instrument_by_symbol(conn, symbol) or repo.create_instrument(
            conn, symbol=symbol, name=a.name if len(a.symbols) == 1 else None,
            exchange="NSE" if symbol.endswith(".NS") else ("BSE" if symbol.endswith(".BO") else None),
            currency=a.currency, asset_class=a.asset_class)
        out = repo.import_candles(conn, inst["id"], rep.candles, source="yfinance", file_name=None, mode="replace")
        print(f"{symbol}: {out['rows_inserted']} new, {out['rows_updated']} updated ({out['first_date']} -> {out['last_date']})")
        for w in warns + rep.warnings:
            print(f"   note: {w}")
        if a.save_csv:
            d = Path(a.save_csv); d.mkdir(parents=True, exist_ok=True)
            with (d / f"{symbol}.csv").open("w", newline="") as f:
                f.write("Date,Open,High,Low,Close,Volume\n")
                for c in rep.candles:
                    f.write(f"{c['date']},{c['open']},{c['high']},{c['low']},{c['close']},{c['volume']}\n")
    conn.close()
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    main()
