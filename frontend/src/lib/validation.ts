import type { ParamSpec } from "../api/types";

export interface ConfigForm {
  instrumentId: string; start: string; end: string; strategy: string; params: Record<string, string>;
  capital: string; sizingMode: "percent_equity" | "fixed_quantity"; sizingValue: string;
  feePct: string; feeFlat: string; slippageBps: string; stopLoss: string; takeProfit: string; riskFree: string;
  fractional: boolean; name: string;
}
export type Errors = Partial<Record<string, string>>;

const num = (s: string): number => (s.trim() === "" ? NaN : Number(s));

export function validateConfig(f: ConfigForm, specs: ParamSpec[], bounds?: { first: string | null; last: string | null }): Errors {
  const e: Errors = {};
  if (!f.instrumentId) e.instrumentId = "Choose an instrument";
  if (!f.strategy) e.strategy = "Choose a strategy";
  if (f.start && f.end && f.end < f.start) e.end = "End date must not be before the start date";
  if (bounds?.first && f.end && f.end < bounds.first) e.end = `No data before ${bounds.first}`;
  if (bounds?.last && f.start && f.start > bounds.last) e.start = `No data after ${bounds.last}`;

  const cap = num(f.capital);
  if (!Number.isFinite(cap) || cap <= 0) e.capital = "Enter an amount greater than 0";
  else if (cap > 1e12) e.capital = "Amount is too large";

  const sv = num(f.sizingValue);
  if (!Number.isFinite(sv) || sv <= 0) e.sizingValue = "Enter a value greater than 0";
  else if (f.sizingMode === "percent_equity" && sv > 100) e.sizingValue = "Percent must be between 0 and 100";

  const fee = num(f.feePct);
  if (!Number.isFinite(fee) || fee < 0 || fee >= 100) e.feePct = "Enter a percentage from 0 up to (not including) 100";
  const flat = num(f.feeFlat);
  if (!Number.isFinite(flat) || flat < 0) e.feeFlat = "Enter 0 or more";
  const slip = num(f.slippageBps);
  if (!Number.isFinite(slip) || slip < 0 || slip > 2000) e.slippageBps = "Enter basis points from 0 to 2000";
  if (f.stopLoss.trim() !== "") {
    const v = num(f.stopLoss);
    if (!Number.isFinite(v) || v <= 0 || v >= 100) e.stopLoss = "Leave empty, or enter a percentage between 0 and 100";
  }
  if (f.takeProfit.trim() !== "") {
    const v = num(f.takeProfit);
    if (!Number.isFinite(v) || v <= 0 || v > 1000) e.takeProfit = "Leave empty, or enter a percentage between 0 and 1000";
  }
  const rf = num(f.riskFree);
  if (!Number.isFinite(rf) || rf < 0 || rf >= 100) e.riskFree = "Enter an annual rate from 0 to below 100 (%)";

  for (const p of specs) {
    const raw = f.params[p.key] ?? "";
    const v = num(raw);
    if (!Number.isFinite(v)) e[`param.${p.key}`] = "Enter a number";
    else if (p.integer && !Number.isInteger(v)) e[`param.${p.key}`] = "Whole number required";
    else if (v < p.min || v > p.max) e[`param.${p.key}`] = `Must be between ${p.min} and ${p.max}`;
  }
  const fast = num(f.params.fast ?? ""), slow = num(f.params.slow ?? "");
  if (specs.some((p) => p.key === "fast") && specs.some((p) => p.key === "slow") && !e["param.fast"] && !e["param.slow"] && fast >= slow)
    e["param.fast"] = "Fast period must be smaller than slow period";
  const os = num(f.params.oversold ?? ""), ob = num(f.params.overbought ?? "");
  if (specs.some((p) => p.key === "oversold") && !e["param.oversold"] && !e["param.overbought"] && os >= ob)
    e["param.oversold"] = "Oversold level must be below overbought level";
  return e;
}

export const hasErrors = (e: Errors) => Object.values(e).some(Boolean);
