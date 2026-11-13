import type { BacktestResult, Instrument, Metrics, RunSummary, StrategyType, Trade } from "../api/types";

export const instruments: Instrument[] = [
  { id: 1, symbol: "SYNTH-TREND", name: "SYNTHETIC trending series", exchange: null, currency: "INR", asset_class: "equity", is_synthetic: true, created_at: "2026-01-01T00:00:00Z", first_date: "2024-01-01", last_date: "2024-01-12", candle_count: 10 },
  { id: 2, symbol: "RELIANCE.NS", name: "Reliance", exchange: "NSE", currency: "INR", asset_class: "equity", is_synthetic: false, created_at: "2026-01-01T00:00:00Z", first_date: null, last_date: null, candle_count: 0 },
];

export const strategies: StrategyType[] = [
  { id: 1, type: "buy_and_hold", name: "Buy and Hold", description: "Buys on the first bar.", params: [] },
  { id: 2, type: "sma_crossover", name: "SMA Crossover", description: "Fast/slow SMA cross.", params: [
    { key: "fast", label: "Fast period", default: 10, min: 1, max: 500, integer: true }, { key: "slow", label: "Slow period", default: 30, min: 2, max: 1000, integer: true }] },
];

const days = ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05", "2024-01-08", "2024-01-09", "2024-01-10", "2024-01-11", "2024-01-12"];
export const candles = days.map((d, i) => ({ date: d, open: 100 + i, high: 103 + i, low: 98 + i, close: 101 + i, volume: 1000 * (i + 1) }));
export const trades: Trade[] = [
  { trade_no: 1, status: "closed", direction: "LONG", entry_date: "2024-01-02", exit_date: "2024-01-05", entry_price: 101, exit_price: 106, quantity: 100, entry_fee: 10.1, exit_fee: 10.6, gross_pnl: 500, net_pnl: 479.3, return_pct: 4.7, holding_days: 3, exit_reason: "signal" },
  { trade_no: 2, status: "closed", direction: "LONG", entry_date: "2024-01-08", exit_date: "2024-01-10", entry_price: 108, exit_price: 104, quantity: 100, entry_fee: 10.8, exit_fee: 10.4, gross_pnl: -400, net_pnl: -421.2, return_pct: -3.8, holding_days: 2, exit_reason: "stop_loss" },
  { trade_no: 3, status: "open", direction: "LONG", entry_date: "2024-01-11", exit_date: "2024-01-12", entry_price: 110, exit_price: 111, quantity: 90, entry_fee: 9.9, exit_fee: 0, gross_pnl: 90, net_pnl: 80.1, return_pct: 0.8, holding_days: 1, exit_reason: "open" },
];
export const metrics: Metrics = {
  initial_capital: 100000, final_equity: 112345, net_profit: 12345, total_return_pct: 12.345, realized_pnl: 58.1, unrealized_pnl: 80.1, total_fees: 51.8,
  max_drawdown_pct: 4.2, exposure_pct: 60, closed_trades: 2, winning_trades: 1, losing_trades: 1, breakeven_trades: 0, win_rate_pct: 50, avg_trade_return_pct: 0.45,
  avg_win: 479.3, avg_loss: -421.2, profit_factor: 1.14, sharpe_ratio: 1.23, sortino_ratio: 1.8, annual_volatility_pct: 14.2, cagr_pct: 9.1,
  buy_hold_return_pct: 8.5, buy_hold_final_equity: 108500, notes: {},
};
export const result: BacktestResult = {
  id: null, name: null, created_at: null, saved_strategy_id: null,
  instrument: { id: 1, symbol: "SYNTH-TREND", name: "SYNTHETIC trending series", currency: "INR", is_synthetic: true },
  config: { initial_capital: 100000, position_sizing: { mode: "percent_equity", value: 100 }, fee_pct: 0.1, fee_flat: 0, slippage_bps: 5, stop_loss_pct: null, take_profit_pct: null, risk_free_rate: 0, allow_fractional: false },
  period: { start: "2024-01-01", end: "2024-01-12", candles: 10 }, engine_version: "1.0.0",
  strategy: { type: "sma_crossover", name: "SMA Crossover", params: { fast: 10, slow: 30 } },
  metrics, trades, rejected_orders: [], warnings: [], candles,
  equity: days.map((d, i) => ({ date: d, equity: 100000 + i * 1000, cash: 0, position_value: 100000 + i * 1000, drawdown_pct: i === 3 ? -1 : 0, benchmark_equity: 100000 + i * 800 })),
  indicators: [{ name: "SMA 10", panel: "overlay", points: days.slice(2).map((d, i) => ({ date: d, value: 100 + i })) }],
};
export const savedResult: BacktestResult = { ...result, id: 7, name: "My run", created_at: "2026-02-01T10:00:00Z" };
export const summary: RunSummary = {
  run_id: 7, run_name: "My run", symbol: "SYNTH-TREND", is_synthetic: true, strategy_type: "sma_crossover", strategy_name: "SMA Crossover",
  start_date: "2024-01-01", end_date: "2024-01-12", initial_capital: 100000, final_equity: 112345, net_profit: 12345, total_return_pct: 12.345,
  max_drawdown_pct: 4.2, sharpe_ratio: 1.23, win_rate_pct: 50, closed_trades: 2, buy_hold_return_pct: 8.5, created_at: "2026-02-01T10:00:00Z",
};
