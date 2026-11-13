"""
python/data/db_writer.py
--------------------------
Pushes the cleaned CSV (data/processed/cleaned_all_stocks_5yr.csv) into
the MySQL stock_prices table running in the docker/ container.

Setup:
    pip install pandas mysql-connector-python python-dotenv

Before running:
    1. cd into docker/ and run: docker compose up -d
       (starts MySQL and auto-creates the table from mysql-init/01_schema.sql)
    2. Make sure docker/.env has the credentials you want (defaults are fine
       for local dev).

Usage:
    python db_writer.py
    (reads ../../data/processed/cleaned_all_stocks_5yr.csv by default)
"""

import sys
import os
import pandas as pd
import mysql.connector
from dotenv import load_dotenv

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(THIS_DIR, "..", "..", "docker", ".env")
DEFAULT_CSV = os.path.join(THIS_DIR, "..", "..", "data", "processed", "cleaned_all_stocks_5yr.csv")

load_dotenv(ENV_PATH)

DB_CONFIG = {
    "host": os.getenv("MYSQL_HOST", "127.0.0.1"),
    "port": int(os.getenv("MYSQL_PORT", 3306)),
    "user": os.getenv("MYSQL_USER", "root"),
    "password": os.getenv("MYSQL_PASSWORD") or os.getenv("MYSQL_ROOT_PASSWORD"),
    "database": os.getenv("MYSQL_DATABASE", "backtesting_engine"),
}
TABLE_NAME = "stock_prices"
BATCH_SIZE = 5000


def load_rows(csv_path: str):
    print(f"Reading {csv_path} ...")
    df = pd.read_csv(csv_path)
    # Accept either the raw Kaggle column names or already-renamed ones
    df = df.rename(columns={"Name": "symbol", "date": "trade_date"})
    print(f"{len(df)} rows, {df['symbol'].nunique()} tickers")
    rows = [
        (
            r.symbol, r.trade_date,
            None if pd.isna(r.open) else r.open,
            None if pd.isna(r.high) else r.high,
            None if pd.isna(r.low) else r.low,
            r.close, int(r.volume),
        )
        for r in df.itertuples(index=False)
    ]
    return rows


def write_to_db(rows):
    print(f"Connecting to MySQL at {DB_CONFIG['host']}:{DB_CONFIG['port']} ...")
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor()

    insert_sql = f"""
        INSERT INTO {TABLE_NAME} (symbol, trade_date, open, high, low, close, volume)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            open = VALUES(open), high = VALUES(high), low = VALUES(low),
            close = VALUES(close), volume = VALUES(volume)
    """
    for i in range(0, len(rows), BATCH_SIZE):
        cursor.executemany(insert_sql, rows[i:i + BATCH_SIZE])
        conn.commit()
        print(f"  inserted {min(i + BATCH_SIZE, len(rows))}/{len(rows)}")

    cursor.execute(f"SELECT COUNT(*), COUNT(DISTINCT symbol) FROM {TABLE_NAME}")
    total_rows, total_symbols = cursor.fetchone()
    print(f"Done. {TABLE_NAME} now has {total_rows} rows across {total_symbols} symbols.")

    cursor.close()
    conn.close()


if __name__ == "__main__":
    csv_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV
    rows = load_rows(csv_path)
    write_to_db(rows)