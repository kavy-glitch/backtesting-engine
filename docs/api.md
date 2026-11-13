# REST API

Base URL `http://localhost:8000/api/v1` (also `http://localhost:8080/api/v1` through nginx). Interactive documentation with request/response schemas: **http://localhost:8000/docs** (Swagger UI) and `/openapi.json`.

All bodies are JSON. Errors always look like

```json
{"error": {"code": "INSUFFICIENT_DATA", "message": "SMA Crossover needs at least 52 candles …", "details": null}}
```

| Status | Meaning | Typical `code` |
|---|---|---|
| 200 / 201 / 204 | OK / created / deleted | |
| 404 | resource missing | `NOT_FOUND` |
| 409 | duplicate or still in use | `DUPLICATE`, `IN_USE` |
| 413 | CSV larger than 10 MB | `FILE_TOO_LARGE` |
| 422 | invalid input | `VALIDATION_ERROR` (field list in `details`), `DATA_VALIDATION_FAILED` (row list in `details`), `INVALID_PARAMETER`, `INSUFFICIENT_DATA`, `NO_DATA`, `CSV_INVALID`, `UNKNOWN_STRATEGY`, `INVALID_DATA` |
| 502 | market-data provider failed | `PROVIDER_ERROR` |
| 503 | database or engine unavailable | `DATABASE_UNAVAILABLE`, `ENGINE_UNAVAILABLE` |
| 500 | unexpected (generic message, details only in the server log) | `INTERNAL_ERROR`, `DATABASE_ERROR` |

## Health

| Method & path | Description |
|---|---|
| `GET /health` | `{status: ok|degraded, database, engine, engine_version}` |

## Instruments and market data

| Method & path | Description |
|---|---|
| `GET /instruments` | all instruments with `candle_count`, `first_date`, `last_date`, `is_synthetic` |
| `POST /instruments` | `{symbol, name?, exchange?, currency="INR", asset_class="equity"}` → 201. Symbol: letters, digits and `. ^ _ = -`; upper-cased. 409 if it exists |
| `GET /instruments/{id}` | one instrument |
| `DELETE /instruments/{id}` | 204; 409 `IN_USE` while saved backtests reference it |
| `GET /instruments/{id}/candles?start&end&limit` | ascending daily candles |
| `GET /instruments/{id}/imports` | import history (source, rows inserted/updated) |
| `POST /instruments/{id}/import-csv?mode=skip|replace` | multipart field `file`. Validates everything first; on any problem **nothing** is imported and `details` lists `{row, message}` (max 20). Response: counts + `warnings` (re-sorted rows, gaps) |
| `POST /instruments/{id}/fetch` | `{start_date, end_date}` → downloads from Yahoo Finance (`mode=replace` default) |
| `POST /instruments/fetch-symbol` | `{symbol, name?, currency, asset_class, start_date, end_date}` → creates the instrument **only after** a successful download |

## Strategies

| Method & path | Description |
|---|---|
| `GET /strategies` | catalogue (`type`, `name`, `description`, `params[{key,label,default,min,max,integer}]`), synchronised from the engine |
| `GET /saved-strategies` · `POST` · `DELETE /saved-strategies/{id}` | `POST {name, strategy_type, params}`; parameters are validated by the engine (`validate_only`) |

## Backtests

`BacktestIn` (body of run/save):

```json
{
  "instrument_id": 1, "start_date": "2022-01-01", "end_date": null,
  "strategy_type": "sma_crossover", "params": {"fast": 10, "slow": 40},
  "initial_capital": 100000,
  "position_sizing": {"mode": "percent_equity", "value": 100},
  "fee_pct": 0.1, "fee_flat": 0, "slippage_bps": 5,
  "stop_loss_pct": null, "take_profit_pct": null,
  "risk_free_rate": 0.0, "allow_fractional": false,
  "name": "optional", "saved_strategy_id": null
}
```

Unknown fields, NaN/Infinity, negative capital/fees, `end < start`, `percent_equity > 100`, `stop_loss ≥ 100` … are rejected with 422 before the engine is called.

| Method & path | Description |
|---|---|
| `POST /backtests/run` | run, return the result, **save nothing** |
| `POST /backtests` | run **and** save (one transaction, 9 tables) → 201 with the saved result (`id`, `created_at`). The engine is deterministic, so this equals the preview |
| `POST /backtests/compare` | `{…shared settings…, strategies: [{strategy_type, params?}] (1–6)}` → per-strategy `metrics` + `equity`, plus the buy & hold `benchmark`; a failing strategy gets `error` without hiding the others |
| `GET /backtests?page&page_size≤100&instrument_id&strategy_type&sort&order` | saved backtests; `sort` ∈ `created_at, total_return_pct, max_drawdown_pct, sharpe_ratio, net_profit, closed_trades` → `{items,total,page,page_size}` |
| `GET /backtests/{id}` | full result: config, strategy, metrics, trades, equity (+benchmark, drawdown), indicators, candles, warnings, rejected orders |
| `DELETE /backtests/{id}` | 204; cascades to all child rows |
| `GET /backtests/{id}/trades?page&page_size≤200&sort&order&result=win|loss|breakeven&exit_reason` | paginated, filtered, sorted ledger |
| `GET /backtests/{id}/export/{trades|equity|metrics|summary}` | CSV download (`Content-Disposition: attachment`) |

Result shape (abridged): `metrics` has every field from `docs/engine.md`, `null` where not computable, with the reason in `metrics.notes`. `trades[]` contains closed trades followed by the open one (`status: "open"`). `equity[]` has `date, equity, cash, position_value, drawdown_pct, benchmark_equity`. `indicators[]` has `{name, panel: overlay|rsi|macd, points:[{date,value}]}` (warm-up days omitted).

### PowerShell example

```powershell
$body = @{ instrument_id = 1; strategy_type = "sma_crossover"; params = @{ fast = 10; slow = 40 }; initial_capital = 100000; fee_pct = 0.1; slippage_bps = 5 } | ConvertTo-Json -Depth 5
$r = Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/v1/backtests/run -ContentType "application/json" -Body $body
$r.metrics | Select-Object final_equity, total_return_pct, max_drawdown_pct, sharpe_ratio, closed_trades
```
