"""Load the bundled SYNTHETIC demo instruments (data/sample/SYNTH-*.csv).

    python -m scripts.load_demo_data

Safe to run repeatedly: existing dates are skipped."""
from __future__ import annotations

from pathlib import Path

from app.services import candle_validation as cv
from app import repositories as repo
from app.core.config import get_settings
from app.core.db import connect

SAMPLE = Path(__file__).resolve().parents[2] / "data" / "sample"
NAMES = {"SYNTH-TREND": "SYNTHETIC trending series (demo data, not real prices)",
         "SYNTH-VOLATILE": "SYNTHETIC volatile series (demo data, not real prices)",
         "SYNTH-RANGE": "SYNTHETIC range-bound series (demo data, not real prices)"}


def main() -> None:
    conn = connect(get_settings())
    files = sorted(SAMPLE.glob("SYNTH-*.csv"))
    if not files:
        raise SystemExit(f"No sample files in {SAMPLE}. Run: python -m scripts.generate_synthetic_data")
    for f in files:
        symbol = f.stem
        inst = repo.find_instrument_by_symbol(conn, symbol) or repo.create_instrument(
            conn, symbol=symbol, name=NAMES.get(symbol, "SYNTHETIC demo data"), exchange=None, currency="INR",
            asset_class="equity", is_synthetic=True)
        rep = cv.validate_rows(cv.parse_csv_text(f.read_text(encoding="utf-8")))
        if not rep.ok:
            raise SystemExit(f"{f.name} failed validation: {rep.errors}")
        out = repo.import_candles(conn, inst["id"], rep.candles, source="synthetic_sample", file_name=f.name, mode="skip")
        print(f"{symbol}: inserted {out['rows_inserted']}, skipped {out['rows_skipped']}  [SYNTHETIC]")
    conn.close()


if __name__ == "__main__":
    main()
