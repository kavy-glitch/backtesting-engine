# Sample backtest walkthrough (real output)

Run on the bundled **SYNTHETIC** series `SYNTH-TREND` (780 weekdays, 2021-01-04 → 2023-12-29; random numbers, **not market data**) through the API, exactly as the UI does.

**Settings:** SMA crossover fast 10 / slow 40 · capital ₹100 000 · 100 % of cash per buy · fee 0.1 % per fill · slippage 5 bps · no stop-loss.

## Result

| Metric | Value |
|---|---|
| Final equity | ₹1,73,095.48 |
| Net profit | ₹73,095.48 (+73.10 %), CAGR 20.20 % |
| Buy & hold benchmark | +95.23 % (₹1,95,228.86) |
| Max drawdown | 18.01 % |
| Closed trades | 12 (7 winners, 5 losers) + 1 still open |
| Win rate | 58.33 % |
| Average win / loss | ₹8,002.80 / −₹5,522.05 |
| Profit factor | 2.03 |
| Sharpe / Sortino | 1.19 / 1.88 (252-day annualisation, risk-free 0 %) |
| Annual volatility | 15.97 % |
| Total fees | ₹2,760.73 |
| Time in market | 62.95 % |
| Unrealised P&L of the open trade | ₹44,686.17 (entered 2023-08-29) |

On this strongly trending synthetic series the trend-follower trails buy & hold, which is plausible for a strategy that is out of the market 37 % of the time and pays costs. It says nothing about real markets.

## Checking trade #1 by hand

The engine's first trade: signal on the close before 2021-04-23, filled at that day's open.

```
entry fill   = open × (1 + 5/10 000)      = 996.968235     (open was 996.47)
quantity     = floor(100 000 / (996.968235 × 1.001))  = floor(100.2) = 100 shares
entry fee    = 100 × 996.968235 × 0.1 %   = 99.6968
exit  (2021-08-09) fill = 1090.83431,  exit fee = 109.0834
gross P&L    = (1090.83431 − 996.968235) × 100  = 9 386.6075
net P&L      = 9 386.6075 − 99.6968 − 109.0834  = 9 177.8273   ← engine: 9 177.827245…
return       = 9 177.8273 / (99 696.8235 + 99.6968) = +9.20 %  ← engine: 9.1965 %
```

## Comparing strategies on the same series (default parameters, same costs)

| Strategy | Total return | Max drawdown | Sharpe | Closed trades |
|---|---|---|---|---|
| Buy and Hold | +97.44 % | 32.38 % | 1.22 | 0 (still open) |
| SMA Crossover 10/30 | +55.38 % | 22.46 % | 0.99 | 16 |
| EMA Crossover 12/26 | +62.46 % | 25.89 % | 1.06 | 10 |
| RSI Threshold 14 (30/70) | +4.72 % | 22.91 % | 0.20 | 3 |
| MACD Crossover 12/26/9 | +4.61 % | 28.73 % | 0.17 | 34 |

(Note: the Buy and Hold *strategy* buys at the second candle's open, the *benchmark* at the first, hence +97.44 % vs +95.23 %.)

## Reproduce

1. UI: Backtest → instrument `SYNTH-TREND` → strategy SMA Crossover → Fast 10, Slow 40 → Fee 0.1, Slippage 5 → **Run backtest**.
2. API: `docs/api.md` (PowerShell example) with `fast = 10; slow = 40`.
3. Independent check: `docker compose --profile test run --rm tests` re-computes this kind of run in plain Python and compares every trade.
