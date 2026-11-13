"""Orchestration: candles from MySQL -> C++ engine -> API response / persistence / exports."""
from __future__ import annotations

from typing import Any, Optional

from app import repositories as repo
from app.core.config import Settings
from app.integrations.engine_client import EngineClient, EngineError, EngineUnavailable
from app.core.errors import ApiError
from app.api.schemas import BacktestIn, CompareIn, RunSettings

_ENGINE_STATUS = {"INTERNAL": 500, "IO_ERROR": 500}


def engine_failure(exc: Exception) -> ApiError:
    if isinstance(exc, EngineError):
        return ApiError(_ENGINE_STATUS.get(exc.code, 422), exc.code, exc.message)
    return ApiError(503, "ENGINE_UNAVAILABLE", "The backtesting engine is not available. Check PBE_ENGINE_PATH.")


def config_echo(cfg: RunSettings) -> dict:
    return {"initial_capital": cfg.initial_capital,
            "position_sizing": {"mode": cfg.position_sizing.mode, "value": cfg.position_sizing.value},
            "fee_pct": cfg.fee_pct, "fee_flat": cfg.fee_flat, "slippage_bps": cfg.slippage_bps,
            "stop_loss_pct": cfg.stop_loss_pct, "take_profit_pct": cfg.take_profit_pct,
            "risk_free_rate": cfg.risk_free_rate, "allow_fractional": cfg.allow_fractional}


def _engine_config(cfg: RunSettings) -> dict:
    c = config_echo(cfg)
    return {k: v for k, v in c.items() if v is not None}


def load_inputs(conn, settings: Settings, cfg: RunSettings) -> tuple[dict, list[dict]]:
    instrument = repo.get_instrument(conn, cfg.instrument_id)
    n = repo.count_candles(conn, cfg.instrument_id, cfg.start_date, cfg.end_date)
    if n == 0:
        raise ApiError(422, "NO_DATA", f"No candles for {instrument['symbol']} in the selected period. "
                       "Import a CSV or fetch data first.")
    if n > settings.max_candles_per_run:
        raise ApiError(422, "TOO_MUCH_DATA", f"{n} candles selected; the limit is {settings.max_candles_per_run}. Narrow the date range.")
    return instrument, repo.get_candles(conn, cfg.instrument_id, cfg.start_date, cfg.end_date)


def _trade_shape(t: dict, trade_no: int) -> dict:
    keys = ["status", "direction", "entry_date", "exit_date", "entry_price", "exit_price", "quantity", "entry_fee",
            "exit_fee", "gross_pnl", "net_pnl", "return_pct", "holding_days", "exit_reason"]
    return {"trade_no": trade_no, **{k: t[k] for k in keys}}


def build_run_response(*, run_id: Optional[int], name: Optional[str], created_at: Optional[str], instrument: dict,
                       config: dict, period: dict, engine_version: str, strategy: dict, metrics: dict, trades: list[dict],
                       equity: list[dict], indicators: list[dict], rejected_orders: list[str], warnings: list[str],
                       candles: list[dict], saved_strategy_id: Optional[int] = None) -> dict:
    return {"id": run_id, "name": name, "created_at": created_at, "saved_strategy_id": saved_strategy_id,
            "instrument": {k: instrument[k] for k in ("id", "symbol", "name", "currency", "is_synthetic")},
            "config": config, "period": period, "engine_version": engine_version, "strategy": strategy,
            "metrics": metrics, "trades": trades, "equity": equity, "indicators": indicators,
            "rejected_orders": rejected_orders, "warnings": warnings, "candles": candles}


def execute(conn, engine: EngineClient, settings: Settings, cfg: BacktestIn) -> dict:
    """Run one backtest (nothing is written to the database)."""
    instrument, candles = load_inputs(conn, settings, cfg)
    request = {"symbol": instrument["symbol"], "candles": candles,
               "strategy": {"type": cfg.strategy_type, "params": cfg.params}, "config": _engine_config(cfg)}
    try:
        out = engine.run(request)
    except (EngineError, EngineUnavailable) as exc:
        raise engine_failure(exc) from exc
    res = out["result"]
    equity = [{**e, "benchmark_equity": res["benchmark"][i]["equity"]} for i, e in enumerate(res["equity"])]
    dates = [e["date"] for e in equity]
    indicators = [{"name": s["name"], "panel": s["panel"],
                   "points": [{"date": dates[i], "value": v} for i, v in enumerate(s["values"]) if v is not None]}
                  for s in res["indicators"]]
    trades = [_trade_shape(t, t["id"]) for t in res["trades"]]
    if res.get("open_trade"):
        trades.append(_trade_shape(res["open_trade"], len(trades) + 1))
    metrics = res["metrics"]
    response = build_run_response(
        run_id=None, name=cfg.name, created_at=None, instrument=instrument, config=config_echo(cfg),
        period={"start": candles[0]["date"], "end": candles[-1]["date"], "candles": len(candles)},
        engine_version=out["engine_version"], strategy=res["strategy"], metrics=metrics, trades=trades,
        equity=equity, indicators=indicators,
        rejected_orders=[f"{o['date']} {o['side']}: {o['reason']}" for o in res["rejected_orders"]],
        warnings=res["warnings"], candles=candles, saved_strategy_id=cfg.saved_strategy_id)
    response["_engine_result"] = res  # consumed by save_backtest, removed before returning to clients
    return response


def save_backtest(conn, engine: EngineClient, settings: Settings, cfg: BacktestIn) -> dict:
    """Run the backtest and persist everything in one transaction. The engine is deterministic,
    so the saved result equals what the preview showed for the same inputs."""
    if cfg.saved_strategy_id is not None:
        repo.get_saved_strategy(conn, cfg.saved_strategy_id)  # 404 if it does not exist
    resp = execute(conn, engine, settings, cfg)
    res = resp.pop("_engine_result")
    stype = repo.get_strategy_type(conn, resp["strategy"]["type"])
    run_id = repo.save_run(
        conn, name=cfg.name, instrument_id=cfg.instrument_id, strategy_type_id=stype["id"],
        saved_strategy_id=cfg.saved_strategy_id, start=resp["period"]["start"], end=resp["period"]["end"],
        cfg=resp["config"], engine_version=resp["engine_version"], strategy_params=resp["strategy"]["params"], result=res)
    return get_saved_run(conn, run_id)


def get_saved_run(conn, run_id: int) -> dict:
    raw = repo.load_run(conn, run_id)
    run = raw["run"]
    candles = repo.get_candles(conn, run["instrument_id"], _d(run["start_date"]), _d(run["end_date"]))
    metrics = {"initial_capital": run["initial_capital"], **raw["metrics"]}
    config = {"initial_capital": run["initial_capital"],
              "position_sizing": {"mode": run["sizing_mode"], "value": run["sizing_value"]},
              "fee_pct": run["fee_pct"], "fee_flat": run["fee_flat"], "slippage_bps": run["slippage_bps"],
              "stop_loss_pct": run["stop_loss_pct"], "take_profit_pct": run["take_profit_pct"],
              "risk_free_rate": run["risk_free_rate"], "allow_fractional": run["allow_fractional"]}
    instrument = {"id": run["instrument_id"], "symbol": run["symbol"], "name": run["instrument_name"],
                  "currency": run["currency"], "is_synthetic": run["is_synthetic"]}
    return build_run_response(
        run_id=run["id"], name=run["name"], created_at=run["created_at"], instrument=instrument, config=config,
        period={"start": run["start_date"], "end": run["end_date"], "candles": len(candles)},
        engine_version=run["engine_version"],
        strategy={"type": run["type_key"], "name": run["strategy_name"], "params": raw["params"]},
        metrics=metrics, trades=raw["trades"], equity=raw["equity"], indicators=raw["indicators"],
        rejected_orders=[m["message"] for m in raw["messages"] if m["kind"] == "rejected_order"],
        warnings=[m["message"] for m in raw["messages"] if m["kind"] == "warning"],
        candles=candles, saved_strategy_id=run["saved_strategy_id"])


def _d(iso: str):
    from datetime import date
    return date.fromisoformat(iso)


def compare(conn, engine: EngineClient, settings: Settings, cfg: CompareIn) -> dict:
    instrument, candles = load_inputs(conn, settings, cfg)
    results: list[dict[str, Any]] = []
    benchmark: list[dict] = []
    for spec in cfg.strategies:
        request = {"symbol": instrument["symbol"], "candles": candles,
                   "strategy": {"type": spec.strategy_type, "params": spec.params}, "config": _engine_config(cfg)}
        try:
            res = engine.run(request)["result"]
        except EngineError as exc:  # one bad strategy must not hide the others
            results.append({"strategy": {"type": spec.strategy_type, "params": spec.params}, "error": {"code": exc.code, "message": exc.message}})
            continue
        except EngineUnavailable as exc:
            raise engine_failure(exc) from exc
        if not benchmark:
            benchmark = [{"date": b["date"], "equity": b["equity"]} for b in res["benchmark"]]
        results.append({"strategy": res["strategy"], "metrics": res["metrics"], "error": None,
                        "equity": [{"date": e["date"], "equity": e["equity"], "drawdown_pct": e["drawdown_pct"]} for e in res["equity"]]})
    return {"instrument": {k: instrument[k] for k in ("id", "symbol", "name", "currency", "is_synthetic")},
            "period": {"start": candles[0]["date"], "end": candles[-1]["date"], "candles": len(candles)},
            "config": config_echo(cfg), "benchmark": benchmark, "results": results}


