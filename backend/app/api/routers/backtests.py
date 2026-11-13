from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query, Response

from app import repositories as repo
from app import services
from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.core.deps import get_engine
from app.integrations.engine_client import EngineClient
from app.api.schemas import BacktestIn, CompareIn

router = APIRouter(prefix="/backtests", tags=["backtests"])


@router.post("/run", summary="Run a backtest and return the result (nothing is saved)")
def run(body: BacktestIn, conn=Depends(get_db), engine: EngineClient = Depends(get_engine),
        settings: Settings = Depends(get_settings)):
    resp = services.execute(conn, engine, settings, body)
    resp.pop("_engine_result", None)
    return resp


@router.post("", status_code=201, summary="Run a backtest and save it")
def create(body: BacktestIn, conn=Depends(get_db), engine: EngineClient = Depends(get_engine),
           settings: Settings = Depends(get_settings)):
    return services.save_backtest(conn, engine, settings, body)


@router.post("/compare", summary="Run several strategies on the same data and settings")
def compare(body: CompareIn, conn=Depends(get_db), engine: EngineClient = Depends(get_engine),
            settings: Settings = Depends(get_settings)):
    return services.compare(conn, engine, settings, body)


@router.get("", summary="Saved backtests (paginated, filterable, sortable)")
def list_runs(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
              instrument_id: Optional[int] = Query(None, gt=0), strategy_type: Optional[str] = Query(None, max_length=40),
              sort: str = "created_at", order: Literal["asc", "desc"] = "desc", conn=Depends(get_db)):
    return repo.list_runs(conn, page=page, page_size=page_size, instrument_id=instrument_id,
                          strategy_type=strategy_type, sort=sort, order=order)


@router.get("/{run_id}", summary="One saved backtest with trades, equity curve, indicators and candles")
def get_run(run_id: int, conn=Depends(get_db)):
    return services.get_saved_run(conn, run_id)


@router.delete("/{run_id}", status_code=204, summary="Delete a saved backtest")
def delete_run(run_id: int, conn=Depends(get_db)):
    repo.delete_run(conn, run_id)
    return Response(status_code=204)


@router.get("/{run_id}/trades", summary="Trades of a saved backtest (paginated)")
def trades(run_id: int, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=200),
           sort: str = "trade_no", order: Literal["asc", "desc"] = "asc",
           result: Optional[Literal["win", "loss", "breakeven"]] = None,
           exit_reason: Optional[Literal["signal", "stop_loss", "take_profit", "open"]] = None, conn=Depends(get_db)):
    return repo.list_trades(conn, run_id, page=page, page_size=page_size, sort=sort, order=order,
                            result=result, exit_reason=exit_reason)


@router.get("/{run_id}/export/{kind}", summary="Download trades / equity / metrics / summary as CSV")
def export(run_id: int, kind: Literal["trades", "equity", "metrics", "summary"], conn=Depends(get_db)):
    run = services.get_saved_run(conn, run_id)
    body = services.export_csv(kind, run)
    return Response(content=body, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="backtest_{run_id}_{kind}.csv"'})
