import type { BacktestResult, Instrument, RunRequest, StrategyType } from "../api/types";
import type { ConfigForm } from "./validation";

export function defaultForm(instruments: Instrument[], strategies: StrategyType[]): ConfigForm {
  const inst = instruments.find((i) => i.candle_count > 0) ?? instruments[0];
  const s = strategies.find((x) => x.type === "sma_crossover") ?? strategies[0];
  return {
    instrumentId: inst ? String(inst.id) : "", start: "", end: "", strategy: s?.type ?? "",
    params: Object.fromEntries((s?.params ?? []).map((p) => [p.key, String(p.default)])),
    capital: "100000", sizingMode: "percent_equity", sizingValue: "100", feePct: "0.1", feeFlat: "0", slippageBps: "5",
    stopLoss: "", takeProfit: "", riskFree: "0", fractional: false, name: "",
  };
}

export function formFromResult(r: BacktestResult): ConfigForm {
  const c = r.config;
  return {
    instrumentId: String(r.instrument.id), start: r.period.start, end: r.period.end, strategy: r.strategy.type,
    params: Object.fromEntries(Object.entries(r.strategy.params).map(([k, v]) => [k, String(v)])),
    capital: String(c.initial_capital), sizingMode: c.position_sizing.mode, sizingValue: String(c.position_sizing.value),
    feePct: String(c.fee_pct), feeFlat: String(c.fee_flat), slippageBps: String(c.slippage_bps),
    stopLoss: c.stop_loss_pct === null ? "" : String(c.stop_loss_pct), takeProfit: c.take_profit_pct === null ? "" : String(c.take_profit_pct),
    riskFree: String(+(c.risk_free_rate * 100).toFixed(4)), fractional: c.allow_fractional, name: r.name ?? "",
  };
}

export function toRequest(f: ConfigForm, savedStrategyId?: number | null): RunRequest {
  return {
    instrument_id: Number(f.instrumentId), start_date: f.start || null, end_date: f.end || null,
    strategy_type: f.strategy, params: Object.fromEntries(Object.entries(f.params).map(([k, v]) => [k, Number(v)])),
    name: f.name.trim() || null, saved_strategy_id: savedStrategyId ?? null,
    initial_capital: Number(f.capital), position_sizing: { mode: f.sizingMode, value: Number(f.sizingValue) },
    fee_pct: Number(f.feePct), fee_flat: Number(f.feeFlat), slippage_bps: Number(f.slippageBps),
    stop_loss_pct: f.stopLoss.trim() === "" ? null : Number(f.stopLoss), take_profit_pct: f.takeProfit.trim() === "" ? null : Number(f.takeProfit),
    risk_free_rate: Number(f.riskFree) / 100, allow_fractional: f.fractional,
  };
}
