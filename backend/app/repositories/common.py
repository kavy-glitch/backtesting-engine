"""Shared row-conversion helpers for the repositories (DECIMAL -> float, dates -> ISO strings)."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Iterable, Optional



def to_json_value(v: Any) -> Any:
    """DECIMAL -> float, DATE/DATETIME -> ISO string, everything else unchanged."""
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, datetime):
        return v.isoformat(timespec="seconds") + "Z"
    if isinstance(v, date):
        return v.isoformat()
    return v


def to_row(r: Optional[dict]) -> Optional[dict]:
    return None if r is None else {k: to_json_value(v) for k, v in r.items()}


def to_rows(rs: Iterable[dict]) -> list[dict]:
    return [to_row(r) for r in rs]


