# Engine: execution model, indicators, metrics, JSON contract

## Execution model (what happens on every candle)

For candle *i* (in this order):

1. **Execute the pending order.** A signal produced at the close of candle *i-1* is filled at the **open of candle *i***.
   * Buy fill price = `open × (1 + slippage_bps/10 000)`; sell fill = `open × (1 − slippage_bps/10 000)`. Slippage always hurts the trader.
   * Fee = `value × fee_pct/100 + fee_flat`, charged on every fill.
   * A BUY while already long, or a SELL while flat, is ignored.
2. **Protective exits** (only if stop-loss and/or take-profit are set and a position is open), checked against candle *i*'s range, starting with the candle the position was opened on:
   * `open ≤ stop` → exit at the open (gap through the stop); else `low ≤ stop` → exit at the stop price.
   * `open ≥ target` → exit at the open (gap through the target); else `high ≥ target` → exit at the target price.
   * If both levels are inside the same candle the **stop-loss is assumed to be hit first** (conservative, because the real intraday order is unknown).
   * Exit prices get slippage and fees like any sell.
3. **Mark to market at the close of candle *i***: `equity = cash + quantity × close`.
4. **Signal for the next candle**: the strategy sees candles `[0 … i]` only.

Consequences:

* **No look-ahead bias.** Indicator value *i* is a function of inputs `0…i` only (checked by the test `SignalsNeverUseFutureData`: truncating the data never changes a signal, and `ChangingFutureBarsDoesNotChangePastTrades` rewrites the future and checks the past equity is identical).
* A signal on the very last candle is never executed (there is no next open).
* **Position sizing:** `percent_equity` spends `value%` of **cash** (the account is flat when buying), rounded **down** to whole shares unless fractional shares are enabled; `fixed_quantity` buys exactly that many shares. If it cannot be afforded (including fees) the order is **rejected and reported** (`rejected_orders`); leverage does not exist, cash never goes negative.
* A position still open at the end stays open: it is valued at the last close and reported as an **open trade** (unrealised P&L, `status = "open"`). Nothing is force-closed, so results are not flattered or penalised by an artificial exit.
* **Re-entry:** after a stop-loss exit the strategy may buy again on its next BUY signal. Level-based strategies (RSI) can re-enter at the next open if the condition still holds.

### Buy-and-hold benchmark

Invests the initial capital at the **open of the first candle** (same sizing, fees and slippage as the strategy), holds, and is valued at each close. It is idealised: exit costs are not deducted. The *Buy and Hold strategy* instead buys at the open of the **second** candle (its signal is formed at candle 0's close), so the two can differ slightly: this is the same rule that governs every strategy.

## Indicators

| Indicator | Definition | First defined at |
|---|---|---|
| SMA(n) | mean of the last n closes | index n−1 |
| EMA(n) | α = 2/(n+1); seed = SMA of the first n values; `EMA_t = α·x_t + (1−α)·EMA_{t−1}` | index n−1 |
| RSI(n), Wilder | first average gain/loss = simple mean of the first n changes; then `avg = (avg·(n−1) + x)/n`; `RSI = 100 − 100/(1+avgGain/avgLoss)`; avgLoss = 0 → 100 (or 50 if there was no movement at all) | index n |
| MACD(f,s,g) | `EMA_f − EMA_s`; signal = EMA_g of the MACD line (seeded with the SMA of its first g values); histogram = MACD − signal | MACD: s−1, signal: s+g−2 |

Signals: **crossover strategies** buy when `fast[i−1] ≤ slow[i−1]` and `fast[i] > slow[i]`, sell on the opposite cross (a signal needs both values defined at *i−1* and *i*). **RSI** buys when `RSI < oversold`, sells when `RSI > overbought`. **Buy & Hold** buys at candle 0.

A run needs at least `warmup + 2` candles (warm-up, one candle to observe, one to execute); otherwise the engine returns `INSUFFICIENT_DATA` (HTTP 422) with the exact number needed.

## Metrics

All money values are in the instrument currency. `daily returns r_t = equity_t / equity_{t−1} − 1` over **all** candles of the run (mark-to-market, including days in cash); `rf_d = risk_free_rate / 252`.

| Metric | Definition | Cannot be computed when |
|---|---|---|
| Net profit | final equity − initial capital | never |
| Total return % | net profit / initial capital × 100 | never (initial capital must be > 0) |
| CAGR % | `(final/initial)^(365.25/days) − 1` | period < 30 days or final equity ≤ 0 |
| Max drawdown % | largest `(peak − equity)/peak × 100`, peak = running maximum of equity from the first candle; **reported as a positive number**, drawdown series is ≤ 0 | never |
| Win rate % | winning closed trades / closed trades (win = net P&L > 0) | no closed trades |
| Average trade return % | mean of per-trade net P&L / (entry price × qty + entry fee) | no closed trades |
| Average win / loss | mean net P&L of winners / of losers (loss is negative) | no winners / no losers |
| Profit factor | sum of winning net P&L / absolute sum of losing net P&L | no losing trades (ratio undefined) or no trades |
| Annual volatility % | sample std (n−1) of daily returns × √252 × 100 | fewer than 2 returns |
| Sharpe | `mean(r − rf_d) / std(r) × √252`, std = sample std | std = 0 or fewer than 2 returns |
| Sortino | `mean(r − rf_d) / DD × √252`, `DD = √(mean(min(r − rf_d, 0)²))` over **all** observations | no below-target returns, or fewer than 2 returns |
| Exposure % | candles with an open position at the close / all candles | never |
| Realised / unrealised P&L | sum of closed net P&L / net P&L of the open trade (net of the entry fee only) | never |
| Total fees | all entry and exit fees (including the open trade's entry fee) | never |
| Buy & hold return % | benchmark final equity / initial capital − 1 | never |

Whenever a metric is `null`, `metrics.notes[<metric>]` says why; the UI shows "–" plus that reason. The engine never emits NaN or infinity. With fewer than 30 daily returns a `sample_size` note warns that risk metrics are statistically weak. Identity checked by tests: `final equity = initial + realised + unrealised`.

Annualisation uses 252 trading days for every ratio; this is a fixed convention, not derived from the data's calendar.

## JSON contract

Request (stdin; or `engine --input file.json`):

```json
{
  "symbol": "SYNTH-TREND",
  "candles": [{"date": "2021-01-04", "open": 1001.19, "high": 1006.22, "low": 982.78, "close": 985.32, "volume": 271859}],
  "strategy": {"type": "sma_crossover", "params": {"fast": 10, "slow": 40}},
  "config": {
    "initial_capital": 100000,
    "position_sizing": {"mode": "percent_equity", "value": 100},
    "fee_pct": 0.1, "fee_flat": 0, "slippage_bps": 5,
    "stop_loss_pct": null, "take_profit_pct": null,
    "risk_free_rate": 0.0, "allow_fractional": false
  }
}
```

Instead of `candles` a request may carry `"candles_csv": "path/to/file.csv"` (the engine then reads the file itself). `"validate_only": true` checks the strategy and config without needing candles (used when saving a strategy).

Success: `{"ok": true, "engine_version": "1.0.0", "result": {strategy, metrics, trades, open_trade, equity, benchmark, indicators, rejected_orders, warnings}}`.
Failure: `{"ok": false, "error": {"code", "message"}}` with codes `PARSE_ERROR`, `DATA_VALIDATION`, `INVALID_PARAMETER`, `INSUFFICIENT_DATA`, `INSUFFICIENT_FUNDS`, `IO_ERROR`, `INTERNAL`. The process exits 0 for every handled error; a non-zero exit or invalid JSON is treated by the API as "engine unavailable" (HTTP 503).

CLI: `engine` (stdin) · `engine --input request.json` · `engine --list-strategies` · `engine --version`.

## Data validation inside the engine

Candles are rejected (never repaired) for: invalid or impossible dates, duplicate or unsorted dates, NaN/missing or non-finite values, prices ≤ 0, negative volume, `high < max(open, close, low)`, `low > min(open, close, high)`. Gaps over 10 calendar days produce a warning (weekends and holidays do not).

## Source map

| File | Contents |
|---|---|
| `include/pbe/core/types.hpp` | `Candle`, `Trade`, `EquityPoint`, enums |
| `include/pbe/core/money.hpp` | `Money` value type: operator overloading, friend functions |
| `include/pbe/core/containers.hpp` | `RollingWindow<T>` template, `NumericBuffer` (Rule of Five) |
| `include/pbe/data/candle_series.hpp` | validated candle container |
| `include/pbe/strategy/indicators.hpp` | SMA, EMA, RSI, MACD |
| `include/pbe/strategy/strategy.hpp` | abstract `Strategy`, concrete strategies, `StrategyFactory` |
| `include/pbe/execution/broker.hpp` | fills, fees, slippage, affordable quantity |
| `include/pbe/execution/portfolio.hpp` | `Position`, `Portfolio` (encapsulated accounting) |
| `include/pbe/execution/backtester.hpp` | the simulation loop |
| `include/pbe/execution/metrics.hpp` | `MetricsCalculator` |
| `include/pbe/io/json_io.hpp`, `csv_loader.hpp` | engine ⇄ API contract, CSV reading |
