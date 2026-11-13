from __future__ import annotations

from fastapi import Depends

from app.core.config import Settings, get_settings
from app.integrations.engine_client import EngineClient
from app.integrations.providers import MarketDataProvider, get_provider  # noqa: F401  (re-exported for overrides)


def get_engine(settings: Settings = Depends(get_settings)) -> EngineClient:
    return EngineClient(settings.engine_path, settings.engine_timeout_seconds)
