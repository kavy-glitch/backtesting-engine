"""Runtime configuration, read from environment variables (see .env.example)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise RuntimeError(f"Environment variable {name} must be an integer (got {raw!r})") from exc


@dataclass(frozen=True)
class Settings:
    db_host: str
    db_port: int
    db_name: str
    db_user: str
    db_password: str
    engine_path: str
    engine_timeout_seconds: int
    cors_origins: tuple[str, ...]
    max_candles_per_run: int
    max_csv_bytes: int


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    origins = os.environ.get("PBE_CORS_ORIGINS", "http://localhost:5173,http://localhost:8080")
    return Settings(
        db_host=os.environ.get("PBE_DB_HOST", "127.0.0.1"),
        db_port=_int("PBE_DB_PORT", 3306),
        db_name=os.environ.get("PBE_DB_NAME", "pbe"),
        db_user=os.environ.get("PBE_DB_USER", "pbe_app"),
        db_password=os.environ.get("PBE_DB_PASSWORD", ""),
        engine_path=os.environ.get("PBE_ENGINE_PATH", "engine"),
        engine_timeout_seconds=_int("PBE_ENGINE_TIMEOUT_SECONDS", 60),
        cors_origins=tuple(o.strip() for o in origins.split(",") if o.strip()),
        max_candles_per_run=_int("PBE_MAX_CANDLES_PER_RUN", 20000),
        max_csv_bytes=_int("PBE_MAX_CSV_BYTES", 10 * 1024 * 1024),
    )
