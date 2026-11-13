from __future__ import annotations

from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile

from app.services import candle_validation as cv
from app import repositories as repo
from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.core.errors import ApiError
from app.integrations.providers import MarketDataProvider, ProviderError, get_provider
from app.api.schemas import FetchIn, FetchSymbolIn, InstrumentIn

router = APIRouter(prefix="/instruments", tags=["instruments & market data"])


def _validated(rows: list[dict], extra_warnings: list[str] | None = None) -> cv.ValidationReport:
    rep = cv.validate_rows(rows)
    if not rep.ok:
        raise ApiError(422, "DATA_VALIDATION_FAILED",
                       f"{rep.error_count} problem(s) found; nothing was imported.", rep.errors)
    rep.warnings = (extra_warnings or []) + rep.warnings
    return rep


@router.get("", summary="List instruments with candle coverage")
def list_instruments(conn=Depends(get_db)):
    return repo.list_instruments(conn)


@router.post("", status_code=201, summary="Create an instrument (no price data yet)")
def create_instrument(body: InstrumentIn, conn=Depends(get_db)):
    return repo.create_instrument(conn, symbol=body.symbol, name=body.name, exchange=body.exchange,
                                  currency=body.currency, asset_class=body.asset_class)


@router.get("/{instrument_id}", summary="One instrument")
def get_instrument(instrument_id: int, conn=Depends(get_db)):
    return repo.get_instrument(conn, instrument_id)


@router.delete("/{instrument_id}", status_code=204, summary="Delete an instrument and its candles")
def delete_instrument(instrument_id: int, conn=Depends(get_db)):
    repo.delete_instrument(conn, instrument_id)
    return Response(status_code=204)


@router.get("/{instrument_id}/candles", summary="Daily candles for charting")
def candles(instrument_id: int, start: Optional[date] = None, end: Optional[date] = None,
            limit: int = Query(20000, ge=1, le=50000), conn=Depends(get_db)):
    repo.get_instrument(conn, instrument_id)
    return repo.get_candles(conn, instrument_id, start, end, limit)


@router.get("/{instrument_id}/imports", summary="Import history")
def imports(instrument_id: int, conn=Depends(get_db)):
    repo.get_instrument(conn, instrument_id)
    return repo.list_import_batches(conn, instrument_id)


@router.post("/{instrument_id}/import-csv", summary="Import candles from a CSV file")
def import_csv(instrument_id: int, file: UploadFile = File(...),
               mode: Literal["skip", "replace"] = Query("skip", description="What to do with dates that already exist"),
               conn=Depends(get_db), settings: Settings = Depends(get_settings)):
    repo.get_instrument(conn, instrument_id)
    raw = file.file.read(settings.max_csv_bytes + 1)
    if len(raw) > settings.max_csv_bytes:
        raise ApiError(413, "FILE_TOO_LARGE", f"CSV is larger than {settings.max_csv_bytes // 1024 // 1024} MB.")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ApiError(422, "CSV_INVALID", "The file is not valid UTF-8 text.") from exc
    rep = _validated(cv.parse_csv_text(text))
    summary = repo.import_candles(conn, instrument_id, rep.candles, source="csv", file_name=file.filename, mode=mode)
    return {**summary, "warnings": rep.warnings}


def _fetch(provider: MarketDataProvider, symbol: str, start: date, end: date) -> cv.ValidationReport:
    try:
        rows, warns = provider.fetch_daily(symbol, start, end)
    except ProviderError as exc:
        raise ApiError(502, "PROVIDER_ERROR", str(exc)) from exc
    return _validated(rows, warns)


@router.post("/{instrument_id}/fetch", summary="Download daily candles from the market-data provider")
def fetch_for_instrument(instrument_id: int, body: FetchIn,
                         mode: Literal["skip", "replace"] = Query("replace"),
                         conn=Depends(get_db), provider: MarketDataProvider = Depends(get_provider)):
    inst = repo.get_instrument(conn, instrument_id)
    rep = _fetch(provider, inst["symbol"], body.start_date, body.end_date)
    summary = repo.import_candles(conn, instrument_id, rep.candles, source=provider.name, file_name=None, mode=mode)
    return {**summary, "warnings": rep.warnings}


@router.post("/fetch-symbol", status_code=201, summary="Create an instrument (if needed) and download its history")
def fetch_symbol(body: FetchSymbolIn, conn=Depends(get_db), provider: MarketDataProvider = Depends(get_provider)):
    symbol = body.symbol.strip().upper()
    rep = _fetch(provider, symbol, body.start_date, body.end_date)   # fetch FIRST: no empty instrument on failure
    inst = repo.find_instrument_by_symbol(conn, symbol)
    if inst is None:
        exchange = "NSE" if symbol.endswith(".NS") else ("BSE" if symbol.endswith(".BO") else None)
        inst = repo.create_instrument(conn, symbol=symbol, name=body.name, exchange=exchange,
                                      currency=body.currency.upper(), asset_class=body.asset_class)
    summary = repo.import_candles(conn, inst["id"], rep.candles, source=provider.name, file_name=None, mode="replace")
    return {"instrument": repo.get_instrument(conn, inst["id"]), **summary, "warnings": rep.warnings}
