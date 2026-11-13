"""FastAPI application factory."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import repositories as repo
from app.core.config import get_settings
from app.core.db import connect
from app.integrations.engine_client import EngineClient, EngineUnavailable
from app.core.errors import install_handlers
from app.api.routers import backtests, health, instruments, strategies

log = logging.getLogger("pbe")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def sync_catalogue() -> None:
    s = get_settings()
    engine = EngineClient(s.engine_path, s.engine_timeout_seconds)
    catalog = engine.list_strategies()
    conn = connect(s)
    try:
        repo.sync_strategy_types(conn, catalog)
    finally:
        conn.close()
    log.info("strategy catalogue synchronised (%d strategies)", len(catalog))


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        sync_catalogue()
    except EngineUnavailable as exc:
        log.warning("engine unavailable at startup: %s", exc)
    except Exception as exc:  # DB may still be starting; /health reports it
        log.warning("could not synchronise strategy catalogue at startup: %s", exc)
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Portfolio Backtesting Engine API", version="1.0.0", lifespan=lifespan,
                  description="REST API for the Portfolio Backtesting Engine (C++ engine + MySQL).")
    app.add_middleware(CORSMiddleware, allow_origins=list(get_settings().cors_origins),
                       allow_methods=["GET", "POST", "DELETE", "OPTIONS"], allow_headers=["Content-Type"])
    install_handlers(app)
    for r in (health.router, instruments.router, strategies.router, backtests.router):
        app.include_router(r, prefix="/api/v1")
    return app


app = create_app()
