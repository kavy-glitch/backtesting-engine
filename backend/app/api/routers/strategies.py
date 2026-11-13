from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from app import repositories as repo
from app.core.db import get_db
from app.core.deps import get_engine
from app.integrations.engine_client import EngineClient, EngineError, EngineUnavailable
from app.api.schemas import SavedStrategyIn
from app.services import engine_failure

router = APIRouter(tags=["strategies"])


@router.get("/strategies", summary="Strategy catalogue (synchronised from the engine)")
def strategies(conn=Depends(get_db)):
    return repo.list_strategy_types(conn)


@router.get("/saved-strategies", summary="Saved strategy configurations")
def saved(conn=Depends(get_db)):
    return repo.list_saved_strategies(conn)


@router.post("/saved-strategies", status_code=201, summary="Save a strategy configuration")
def create_saved(body: SavedStrategyIn, conn=Depends(get_db), engine: EngineClient = Depends(get_engine)):
    stype = repo.get_strategy_type(conn, body.strategy_type)
    try:
        engine.validate_strategy(body.strategy_type, body.params)   # the engine owns the parameter rules
    except (EngineError, EngineUnavailable) as exc:
        raise engine_failure(exc) from exc
    sid = repo.create_saved_strategy(conn, body.name, stype["id"], body.params)
    return repo.get_saved_strategy(conn, sid)


@router.delete("/saved-strategies/{sid}", status_code=204, summary="Delete a saved strategy")
def delete_saved(sid: int, conn=Depends(get_db)):
    repo.delete_saved_strategy(conn, sid)
    return Response(status_code=204)
