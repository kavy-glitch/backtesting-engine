import { Play, Save, Bookmark } from "lucide-react";
import type { Instrument, SavedStrategy, StrategyType } from "../../api/types";
import { date } from "../../lib/format";
import type { ConfigForm, Errors } from "../../lib/validation";
import { Button, Field, Input, Select, SyntheticBadge } from "../ui";

interface Props {
  form: ConfigForm; errors: Errors; instruments: Instrument[]; strategies: StrategyType[]; saved: SavedStrategy[];
  running: boolean; saving: boolean; canSave: boolean;
  onChange: (f: ConfigForm) => void; onRun: () => void; onSave: () => void; onSaveStrategy: () => void;
}

export function BacktestForm({ form, errors, instruments, strategies, saved, running, saving, canSave, onChange, onRun, onSave, onSaveStrategy }: Props) {
  const set = <K extends keyof ConfigForm>(k: K, v: ConfigForm[K]) => onChange({ ...form, [k]: v });
  const inst = instruments.find((i) => String(i.id) === form.instrumentId);
  const strat = strategies.find((s) => s.type === form.strategy);
  const invalid = Object.values(errors).some(Boolean);

  const pickStrategy = (type: string) => {
    const s = strategies.find((x) => x.type === type);
    onChange({ ...form, strategy: type, params: Object.fromEntries((s?.params ?? []).map((p) => [p.key, String(p.default)])) });
  };
  const loadSaved = (id: string) => {
    const s = saved.find((x) => String(x.id) === id);
    if (!s) return;
    const spec = strategies.find((x) => x.type === s.strategy_type);
    onChange({ ...form, strategy: s.strategy_type, params: Object.fromEntries((spec?.params ?? []).map((p) => [p.key, String(s.params[p.key] ?? p.default)])) });
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!invalid && !running) onRun(); }} className="space-y-5 p-4" noValidate aria-label="Backtest configuration">
      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-bold">Market & period</legend>
        <Field label="Instrument" error={errors.instrumentId} htmlFor="instrument">
          <Select id="instrument" value={form.instrumentId} error={!!errors.instrumentId} onChange={(e) => set("instrumentId", e.target.value)}>
            {instruments.map((i) => <option key={i.id} value={i.id}>{i.symbol}{i.is_synthetic ? " (synthetic)" : ""} · {i.candle_count} candles</option>)}
          </Select>
        </Field>
        {inst && (
          <p className="num flex flex-wrap items-center gap-2 text-xs text-muted">
            {inst.is_synthetic && <SyntheticBadge />}
            {inst.candle_count ? `Data: ${date(inst.first_date)} → ${date(inst.last_date)}` : "No price data yet. Import it on the Data page."}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="From" error={errors.start} htmlFor="start"><Input id="start" type="date" value={form.start} error={!!errors.start} min={inst?.first_date ?? undefined} max={inst?.last_date ?? undefined} onChange={(e) => set("start", e.target.value)} /></Field>
          <Field label="To" error={errors.end} htmlFor="end"><Input id="end" type="date" value={form.end} error={!!errors.end} min={inst?.first_date ?? undefined} max={inst?.last_date ?? undefined} onChange={(e) => set("end", e.target.value)} /></Field>
        </div>
        <p className="text-xs text-muted">Interval: daily candles. Leave dates empty to use all available data.</p>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-bold">Strategy</legend>
        {saved.length > 0 && (
          <Field label="Load saved strategy" htmlFor="saved">
            <Select id="saved" value="" onChange={(e) => loadSaved(e.target.value)}>
              <option value="">Choose…</option>
              {saved.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Strategy" error={errors.strategy} htmlFor="strategy">
          <Select id="strategy" value={form.strategy} onChange={(e) => pickStrategy(e.target.value)}>
            {strategies.map((s) => <option key={s.type} value={s.type}>{s.name}</option>)}
          </Select>
        </Field>
        {strat && <p className="text-xs text-muted">{strat.description}</p>}
        {strat && strat.params.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {strat.params.map((p) => (
              <Field key={p.key} label={p.label} error={errors[`param.${p.key}`]} hint={`${p.min}–${p.max}${p.integer ? ", whole number" : ""}`} htmlFor={`p-${p.key}`}>
                <Input id={`p-${p.key}`} inputMode="decimal" value={form.params[p.key] ?? ""} error={!!errors[`param.${p.key}`]} onChange={(e) => set("params", { ...form.params, [p.key]: e.target.value })} />
              </Field>
            ))}
          </div>
        )}
        <Button type="button" variant="ghost" className="!px-2 !py-1.5 !text-xs" icon={<Bookmark className="h-3.5 w-3.5" />} onClick={onSaveStrategy} disabled={!!Object.keys(errors).find((k) => k.startsWith("param.") || k === "strategy")}>Save this strategy for reuse</Button>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-bold">Capital & position size</legend>
        <Field label="Initial capital" error={errors.capital} htmlFor="capital"><Input id="capital" inputMode="decimal" value={form.capital} error={!!errors.capital} onChange={(e) => set("capital", e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Position sizing" htmlFor="sizing-mode">
            <Select id="sizing-mode" value={form.sizingMode} onChange={(e) => onChange({ ...form, sizingMode: e.target.value as ConfigForm["sizingMode"], sizingValue: e.target.value === "percent_equity" ? "100" : "10" })}>
              <option value="percent_equity">% of cash</option><option value="fixed_quantity">Fixed quantity</option>
            </Select>
          </Field>
          <Field label={form.sizingMode === "percent_equity" ? "Percent (1–100)" : "Shares per buy"} error={errors.sizingValue} htmlFor="sizing-value">
            <Input id="sizing-value" inputMode="decimal" value={form.sizingValue} error={!!errors.sizingValue} onChange={(e) => set("sizingValue", e.target.value)} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.fractional} onChange={(e) => set("fractional", e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" /> Allow fractional shares</label>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-bold">Costs & risk</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fee per trade (%)" error={errors.feePct} htmlFor="fee-pct"><Input id="fee-pct" inputMode="decimal" value={form.feePct} error={!!errors.feePct} onChange={(e) => set("feePct", e.target.value)} /></Field>
          <Field label="Flat fee per trade" error={errors.feeFlat} htmlFor="fee-flat"><Input id="fee-flat" inputMode="decimal" value={form.feeFlat} error={!!errors.feeFlat} onChange={(e) => set("feeFlat", e.target.value)} /></Field>
          <Field label="Slippage (bps)" error={errors.slippageBps} hint="1 bp = 0.01%" htmlFor="slip"><Input id="slip" inputMode="decimal" value={form.slippageBps} error={!!errors.slippageBps} onChange={(e) => set("slippageBps", e.target.value)} /></Field>
          <Field label="Risk-free rate (%/yr)" error={errors.riskFree} hint="Used by Sharpe/Sortino" htmlFor="rf"><Input id="rf" inputMode="decimal" value={form.riskFree} error={!!errors.riskFree} onChange={(e) => set("riskFree", e.target.value)} /></Field>
          <Field label="Stop-loss (%)" error={errors.stopLoss} hint="Optional" htmlFor="sl"><Input id="sl" inputMode="decimal" placeholder="none" value={form.stopLoss} error={!!errors.stopLoss} onChange={(e) => set("stopLoss", e.target.value)} /></Field>
          <Field label="Take-profit (%)" error={errors.takeProfit} hint="Optional" htmlFor="tp"><Input id="tp" inputMode="decimal" placeholder="none" value={form.takeProfit} error={!!errors.takeProfit} onChange={(e) => set("takeProfit", e.target.value)} /></Field>
        </div>
        <p className="text-xs text-muted">Signals form at a candle&apos;s close and fill at the <b>next candle&apos;s open</b>. Long-only, no leverage.</p>
      </fieldset>

      <Field label="Name (optional, used when saving)" htmlFor="name"><Input id="name" maxLength={120} value={form.name} placeholder="e.g. SMA 10/30 on RELIANCE" onChange={(e) => set("name", e.target.value)} /></Field>

      <div className="sticky bottom-0 -mx-4 -mb-4 flex gap-2 border-t border-line bg-surface p-4">
        <Button type="submit" data-cursor="Run" busy={running} disabled={invalid || !form.instrumentId || !inst?.candle_count} icon={<Play className="h-4 w-4" />} className="flex-1">Run backtest</Button>
        <Button type="button" variant="secondary" busy={saving} disabled={!canSave || invalid} icon={<Save className="h-4 w-4" />} onClick={onSave}>Save</Button>
      </div>
    </form>
  );
}
