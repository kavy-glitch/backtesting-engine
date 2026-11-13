"""Strict validation of imported OHLCV data. Nothing invalid is ever stored silently.

Shared by CSV import and the market-data provider path, so both obey identical rules.
"""
from __future__ import annotations

import csv
import io
import math
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from app.core.errors import ApiError

REQUIRED_COLUMNS = ("date", "open", "high", "low", "close", "volume")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_REPORTED_ERRORS = 20
MAX_GAP_DAYS = 10
MAX_ROWS = 100_000


@dataclass
class ValidationReport:
    candles: list[dict] = field(default_factory=list)   # clean, sorted ascending
    errors: list[dict] = field(default_factory=list)    # [{"row": n, "message": "..."}]
    warnings: list[str] = field(default_factory=list)
    error_count: int = 0

    @property
    def ok(self) -> bool:
        return self.error_count == 0


def _normalise_date(raw) -> date | None:
    if isinstance(raw, datetime):
        return raw.date()
    if isinstance(raw, date):
        return raw
    s = str(raw).strip()
    if len(s) > 10 and s[10] in " T":
        s = s[:10]
    if not _DATE_RE.match(s):
        return None
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


def _number(raw) -> Decimal | None:
    if raw is None:
        return None
    s = str(raw).strip().replace(",", "") if not isinstance(raw, (int, float, Decimal)) else raw
    if s == "":
        return None
    try:
        d = Decimal(str(s))
    except InvalidOperation:
        return None
    if not d.is_finite():
        return None
    return d


def validate_rows(rows: list[dict]) -> ValidationReport:
    """rows: dicts with lower-case keys date/open/high/low/close/volume; `_row` = source row number."""
    rep = ValidationReport()

    def err(row_no: int, msg: str) -> None:
        rep.error_count += 1
        if len(rep.errors) < MAX_REPORTED_ERRORS:
            rep.errors.append({"row": row_no, "message": msg})

    if not rows:
        err(0, "no data rows found")
        return rep
    if len(rows) > MAX_ROWS:
        err(0, f"too many rows ({len(rows)}); the limit is {MAX_ROWS}")
        return rep

    seen: dict[date, int] = {}
    clean: list[dict] = []
    for i, r in enumerate(rows):
        row_no = r.get("_row", i + 2)
        d = _normalise_date(r.get("date"))
        if d is None:
            err(row_no, f"invalid date {r.get('date')!r} (expected YYYY-MM-DD)")
            continue
        vals: dict[str, Decimal] = {}
        bad = False
        for col in ("open", "high", "low", "close", "volume"):
            v = _number(r.get(col))
            if v is None:
                err(row_no, f"{col} is missing or not a number ({r.get(col)!r})")
                bad = True
            else:
                vals[col] = v
        if bad:
            continue
        o, h, l, c, vol = (vals[k] for k in ("open", "high", "low", "close", "volume"))
        if min(o, h, l, c) <= 0:
            err(row_no, "prices must be greater than zero"); continue
        if vol < 0:
            err(row_no, "volume must not be negative"); continue
        if h < max(o, c, l):
            err(row_no, "invalid OHLC: high is below open/close/low"); continue
        if l > min(o, c, h):
            err(row_no, "invalid OHLC: low is above open/close/high"); continue
        if d in seen:
            err(row_no, f"duplicate date {d} (first seen on row {seen[d]})"); continue
        seen[d] = row_no
        clean.append({"date": d, "open": o, "high": h, "low": l, "close": c, "volume": vol})

    if rep.error_count:
        return rep

    if any(clean[i]["date"] < clean[i - 1]["date"] for i in range(1, len(clean))):
        clean.sort(key=lambda x: x["date"])
        rep.warnings.append("Rows were not in ascending date order and have been sorted.")
    gaps = [(clean[i - 1]["date"], clean[i]["date"]) for i in range(1, len(clean))
            if (clean[i]["date"] - clean[i - 1]["date"]).days > MAX_GAP_DAYS]
    for a, b in gaps[:5]:
        rep.warnings.append(f"Gap of {(b - a).days} days between {a} and {b} (possible missing candles).")
    if len(gaps) > 5:
        rep.warnings.append(f"{len(gaps) - 5} more gaps not listed.")
    rep.candles = clean
    return rep


def parse_csv_text(text: str) -> list[dict]:
    """Parse CSV text into row dicts. Raises ApiError(422) when required columns are missing."""
    if text.startswith("\ufeff"):
        text = text[1:]
    reader = csv.reader(io.StringIO(text))
    try:
        header = next(reader)
    except StopIteration:
        raise ApiError(422, "CSV_INVALID", "The CSV file is empty.") from None
    names = [h.strip().lower() for h in header]
    missing = [c for c in REQUIRED_COLUMNS if c not in names]
    if missing:
        raise ApiError(422, "CSV_INVALID", f"The CSV is missing required column(s): {', '.join(missing)}. "
                       f"Expected header: Date,Open,High,Low,Close,Volume",
                       {"found": [h.strip() for h in header]})
    idx = {n: names.index(n) for n in REQUIRED_COLUMNS}
    rows: list[dict] = []
    for line_no, cells in enumerate(reader, start=2):
        if not any(c.strip() for c in cells):
            continue
        row = {k: (cells[i].strip() if i < len(cells) else "") for k, i in idx.items()}
        row["_row"] = line_no
        rows.append(row)
    return rows


def is_finite_number(x: float) -> bool:
    return isinstance(x, (int, float)) and math.isfinite(x)
