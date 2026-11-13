export interface Instrument {
  id: number; symbol: string; name: string | null; exchange: string | null; currency: string;
  asset_class: string; is_synthetic: boolean; created_at: string;
  first_date: string | null; last_date: string | null; candle_count: number;
}
export interface ParamSpec { key: string; label: string; default: number; min: number; max: number; integer: boolean }
export interface StrategyType { id: number; type: string; name: string; description: string; params: ParamSpec[] }
export interface SavedStrategy { id: number; name: string; strategy_type: string; type_name: string; params: Record<string, number>; created_at: string }

export interface Candle { date: string; open: number; high: number; low: number; close: number; volume: number }
export interface Trade {
  trade_no: number; status: "closed" | "open"; direction: string; entry_date: string; exit_date: string;
  entry_price: number; exit_price: number; quantity: number; entry_fee: number; exit_fee: number;
  gross_pnl: number; net_pnl: number; return_pct: number; holding_days: number;
  exit_reason: "signal" | "stop_loss" | "take_profit" | "open";
}
export interface EquityPoint { date: string; equity: number; cash: number; position_value: number; drawdown_pct: number; benchmark_equity: number }
export interface IndicatorSeries { name: string; panel: "overlay" | "rsi" | "macd"; points: { date: string; value: number }[] }

export interface Metrics {
  initial_capital: number; final_equity: number; net_profit: number; total_return_pct: number;
  realized_pnl: number; unrealized_pnl: number; total_fees: number; max_drawdown_pct: number; exposure_pct: number;
  closed_trades: number; winning_trades: number; losing_trades: number; breakeven_trades: number;
  win_rate_pct: number | null; avg_trade_return_pct: number | null; avg_win: number | null; avg_loss: number | null;
  profit_factor: number | null; sharpe_ratio: number | null; sortino_ratio: number | null;
  annual_volatility_pct: number | null; cagr_pct: number | null;
  buy_hold_return_pct: number; buy_hold_final_equity: number;
  notes: Record<string, string>;
}
export interface RunConfig {
  initial_capital: number; position_sizing: { mode: "percent_equity" | "fixed_quantity"; value: number };
  fee_pct: number; fee_flat: number; slippage_bps: number; stop_loss_pct: number | null; take_profit_pct: number | null;
  risk_free_rate: number; allow_fractional: boolean;
}
export interface InstrumentRef { id: number; symbol: string; name: string | null; currency: string; is_synthetic: boolean }
export interface BacktestResult {
  id: number | null; name: string | null; created_at: string | null; saved_strategy_id: number | null;
  instrument: InstrumentRef; config: RunConfig; period: { start: string; end: string; candles: number };
  engine_version: string; strategy: { type: string; name: string; params: Record<string, number> };
  metrics: Metrics; trades: Trade[]; equity: EquityPoint[]; indicators: IndicatorSeries[];
  rejected_orders: string[]; warnings: string[]; candles: Candle[];
}
export interface RunSummary {
  run_id: number; run_name: string | null; symbol: string; is_synthetic: boolean; strategy_type: string; strategy_name: string;
  start_date: string; end_date: string; initial_capital: number; final_equity: number; net_profit: number;
  total_return_pct: number; max_drawdown_pct: number; sharpe_ratio: number | null; win_rate_pct: number | null;
  closed_trades: number; buy_hold_return_pct: number; created_at: string;
}
export interface Paged<T> { items: T[]; total: number; page: number; page_size: number }
export interface CompareEntry {
  strategy: { type: string; name?: string; params: Record<string, number> };
  metrics?: Metrics; equity?: { date: string; equity: number; drawdown_pct: number }[];
  error: { code: string; message: string } | null;
}
export interface CompareResult {
  instrument: InstrumentRef; period: { start: string; end: string; candles: number }; config: RunConfig;
  benchmark: { date: string; equity: number }[]; results: CompareEntry[];
}
export interface ImportSummary {
  rows_received: number; rows_inserted: number; rows_updated: number; rows_skipped: number;
  first_date: string; last_date: string; warnings: string[];
}
export interface HealthStatus { status: "ok" | "degraded"; database: string; engine: string; engine_version: string | null }

export interface RunRequest {
  instrument_id: number; start_date?: string | null; end_date?: string | null;
  strategy_type: string; params: Record<string, number>; name?: string | null; saved_strategy_id?: number | null;
  initial_capital: number; position_sizing: { mode: string; value: number };
  fee_pct: number; fee_flat: number; slippage_bps: number; stop_loss_pct: number | null; take_profit_pct: number | null;
  risk_free_rate: number; allow_fractional: boolean;
}
