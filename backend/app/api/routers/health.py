from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.core.db import connect
from app.core.deps import get_engine
from app.integrations.engine_client import EngineClient, EngineUnavailable

router = APIRouter(tags=["health"])


@router.get("/health", summary="Liveness and dependency check")
def health(settings: Settings = Depends(get_settings), engine: EngineClient = Depends(get_engine)):
    db_state, engine_state = "ok", "ok"
    try:
        conn = connect(settings)
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        conn.close()
    except Exception:
        db_state = "unavailable"
    try:
        engine_version = engine.version()
    except EngineUnavailable:
        engine_state, engine_version = "unavailable", None
    return {"status": "ok" if db_state == "ok" and engine_state == "ok" else "degraded",
            "database": db_state, "engine": engine_state, "engine_version": engine_version}
