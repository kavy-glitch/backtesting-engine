"""
python/data/clean_data.py
--------------------------
Reads the raw Kaggle CSV (data/raw/all_stocks_5yr.csv), standardizes
column names, and writes a cleaned CSV to data/processed/.

Usage:
    python clean_data.py
    (reads ../../data/raw/all_stocks_5yr.csv by default, or pass a path)
"""

import sys
import os
import pandas as pd

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_RAW = os.path.join(THIS_DIR, "..", "..", "data", "raw", "all_stocks_5yr.csv")
DEFAULT_OUT = os.path.join(THIS_DIR, "..", "..", "data", "processed", "cleaned_all_stocks_5yr.csv")


def clean(raw_csv_path: str, out_csv_path: str):
    print(f"Reading {raw_csv_path} ...")
    df = pd.read_csv(raw_csv_path)

    df = df.rename(columns={"Name": "symbol", "date": "trade_date"})
    df = df[["symbol", "trade_date", "open", "high", "low", "close", "volume"]]

    before = len(df)
    df = df.dropna(subset=["close", "symbol", "trade_date"])
    dropped = before - len(df)
    if dropped:
        print(f"Dropped {dropped} row(s) missing symbol/date/close (required fields).")

    df["trade_date"] = pd.to_datetime(df["trade_date"]).dt.strftime("%Y-%m-%d")
    df["volume"] = df["volume"].astype("Int64")

    os.makedirs(os.path.dirname(out_csv_path), exist_ok=True)
    df.to_csv(out_csv_path, index=False)
    print(f"Wrote {out_csv_path} ({len(df)} rows, {df['symbol'].nunique()} tickers)")


if __name__ == "__main__":
    raw_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_RAW
    out_path = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUT
    clean(raw_path, out_path)