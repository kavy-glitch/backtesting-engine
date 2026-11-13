"""Bridge to the C++ engine: JSON on stdin, JSON on stdout (see docs/engine.md)."""
from __future__ import annotations

import json
import subprocess
from typing import Any


class EngineUnavailable(Exception):
    """The engine binary is missing, crashed, timed out or returned garbage."""


class EngineError(Exception):
    """The engine ran and rejected the request (bad data, bad parameters, ...)."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code, self.message = code, message


class EngineClient:
    def __init__(self, path: str, timeout_seconds: int = 60):
        self.path = path
        self.timeout = timeout_seconds

    def _call(self, args: list[str], payload: str | None = None) -> Any:
        try:
            proc = subprocess.run(
                [self.path, *args], input=payload, capture_output=True, text=True,
                timeout=self.timeout, check=False,
            )
        except FileNotFoundError as exc:
            raise EngineUnavailable(f"engine executable not found: {self.path}") from exc
        except subprocess.TimeoutExpired as exc:
            raise EngineUnavailable("engine timed out") from exc
        if proc.returncode != 0:
            raise EngineUnavailable(f"engine exited with code {proc.returncode}")
        try:
            return json.loads(proc.stdout)
        except json.JSONDecodeError as exc:
            raise EngineUnavailable("engine returned invalid JSON") from exc

    def run(self, request: dict) -> dict:
        """Returns the engine's `result` object or raises EngineError."""
        out = self._call([], json.dumps(request, allow_nan=False))
        if not out.get("ok"):
            err = out.get("error", {})
            raise EngineError(err.get("code", "ENGINE_ERROR"), err.get("message", "engine error"))
        return out

    def validate_strategy(self, strategy_type: str, params: dict[str, float]) -> None:
        """Dry-run: checks strategy type + parameters without needing any candles."""
        self.run({"validate_only": True, "strategy": {"type": strategy_type, "params": params}})

    def list_strategies(self) -> list[dict]:
        return self._call(["--list-strategies"])

    def version(self) -> str:
        try:
            proc = subprocess.run([self.path, "--version"], capture_output=True, text=True, timeout=10, check=False)
        except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
            raise EngineUnavailable(str(exc)) from exc
        return proc.stdout.strip()
