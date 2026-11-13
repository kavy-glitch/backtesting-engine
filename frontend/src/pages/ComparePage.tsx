import { useState } from "react";
import { GitCompare } from "lucide-react";
import { api, ApiError } from "../api/client";
import type { CompareResult } from "../api/types";
import { COMPARE_COLORS, CompareChart, Legend } from "../components/charts";
import { Button, EmptyState, ErrorState, Field, Input, Notice, Panel, Select, Skeleton, SyntheticBadge, SectionTag } from "../components/ui";
import { date, money, pct, ratio, toneClass } from "../lib/format";
import { useAsync, useToast } from "../lib/hooks";

export function ComparePage() {
  const toast = useToast();
  const lists = useAsync(() => Promise.all([api.instruments(), api.strategies()]), []);
  const [instrumentId, setInstrumentId] = useState("");
  const [picked, setPicked] = useState<string[]>(["buy_and_hold", "sma_crossover", "ema_crossover"]);
  const [capital, setCapital] = useState("100000");
  const [fee, setFee] = useState("0.1");
  const [slip, setSlip] = useState("5");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (lists.loading) return <Skeleton className="h-96" />;
  if (lists.error || !lists.data) return <ErrorState message={lists.error?.message ?? "Could not load data"} onRetry={lists.reload} />;
  const [instruments, strategies] = lists.data;
  const active = picked.filter((t) => strategies.some((s) => s.type === t));
  const withData = instruments.filter((i) => i.candle_count > 0);
  const chosen = instrumentId || String(withData[0]?.id ?? "");
  const inst = instruments.find((i) => String(i.id) === chosen);
  const capNum = Number(capital), feeNum = Number(fee), slipNum = Number(slip);
  const problems = [
    !withData.length && "No instrument has price data yet.",
    !(capNum > 0) && "Initial capital must be greater than 0.",
    !(feeNum >= 0 && feeNum < 100) && "Fee must be at least 0 and below 100%.",
    !(slipNum >= 0 && slipNum <= 2000) && "Slippage must be between 0 and 2000 bps.",
    active.length === 0 && "Choose at least one strategy.",
    active.length > 6 && "Choose at most six strategies.",
    start && end && end < start && "End date must not be before the start date.",
  ].filter(Boolean) as string[];

  const toggle = (t: string) => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  const run = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api.compare({
        instrument_id: Number(chosen), start_date: start || null, end_date: end || null, initial_capital: capNum,
        position_sizing: { mode: "percent_equity", value: 100 }, fee_pct: feeNum, fee_flat: 0, slippage_bps: slipNum,
        stop_loss_pct: null, take_profit_pct: null, risk_free_rate: 0, allow_fractional: false,
        strategies: active.map((t) => ({ strategy_type: t, params: {} })),
      });
      setResult(r);
      toast.push("success", `Compared ${r.results.length} strategies`);
    } catch (e) { const m = e instanceof ApiError ? e.message : "Unexpected error"; setError(m); toast.push("error", m); }
    finally { setBusy(false); }
  };

  const lines = (result?.results ?? []).map((r, i) => ({ r, i })).filter((x) => !x.r.error);
  return (
    <div className="space-y-5">
      <div><SectionTag n={3} name="compare" note="same data, many strategies" /><h1 className="text-2xl font-extrabold">Compare strategies</h1><p className="text-sm text-muted">Run several strategies on the same data, capital and costs. Each uses its default parameters; tune them on the Backtest page.</p></div>
      <Panel title="Setup">
        <form className="space-y-4 p-4" noValidate onSubmit={(e) => { e.preventDefault(); if (!problems.length) void run(); }}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2"><Field label="Instrument" htmlFor="cmp-inst"><Select id="cmp-inst" value={chosen} onChange={(e) => setInstrumentId(e.target.value)}>{withData.map((i) => <option key={i.id} value={i.id}>{i.symbol}{i.is_synthetic ? " (synthetic)" : ""}</option>)}</Select></Field></div>
            <Field label="From" htmlFor="cmp-start"><Input id="cmp-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="To" htmlFor="cmp-end"><Input id="cmp-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
            <Field label="Capital" htmlFor="cmp-cap"><Input id="cmp-cap" inputMode="decimal" value={capital} onChange={(e) => setCapital(e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-2"><Field label="Fee %" htmlFor="cmp-fee"><Input id="cmp-fee" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} /></Field><Field label="Slip bps" htmlFor="cmp-slip"><Input id="cmp-slip" inputMode="decimal" value={slip} onChange={(e) => setSlip(e.target.value)} /></Field></div>
          </div>
          <fieldset><legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Strategies (up to 6)</legend>
            <div className="flex flex-wrap gap-2">{strategies.map((s) => (
              <label key={s.type} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${active.includes(s.type) ? "border-primary bg-primary-soft text-primary" : "border-line text-muted"}`}>
                <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={active.includes(s.type)} onChange={() => toggle(s.type)} />{s.name}
              </label>))}</div></fieldset>
          {inst?.is_synthetic && <p className="flex items-center gap-2 text-xs text-muted"><SyntheticBadge /> Generated demo prices, not real market data.</p>}
          {problems.length > 0 && <Notice tone="warn">{problems.map((p) => <div key={p}>{p}</div>)}</Notice>}
          <Button type="submit" busy={busy} disabled={problems.length > 0} icon={<GitCompare className="h-4 w-4" />}>Compare</Button>
        </form>
      </Panel>
      {error && <Notice tone="error">{error}</Notice>}
      {busy && <Skeleton className="h-96" />}
      {!busy && result && (
        <>
          <Panel title={`${result.instrument.symbol} · ${date(result.period.start)} → ${date(result.period.end)}`}>
            <div className="flex flex-wrap gap-4 px-4 pt-3 text-xs">
              <Legend color="var(--muted)" dashed label="Buy & hold" />
              {lines.map(({ r, i }) => <Legend key={i} color={COMPARE_COLORS[i % COMPARE_COLORS.length]} label={r.strategy.name ?? r.strategy.type} />)}
            </div>
            <CompareChart benchmark={result.benchmark} results={lines.map(({ r }) => ({ label: r.strategy.name ?? r.strategy.type, equity: r.equity ?? [] }))} />
          </Panel>
          <Panel title="Results" >
            <div className="overflow-x-auto"><table className="num w-full min-w-[760px] text-sm">
              <thead className="border-b border-line bg-surface-2 text-xs uppercase tracking-wide text-muted"><tr>
                <th className="px-3 py-2 text-left">Strategy</th><th className="px-3 py-2 text-right">Final equity</th><th className="px-3 py-2 text-right">Return</th><th className="px-3 py-2 text-right">Max drawdown</th>
                <th className="px-3 py-2 text-right">Sharpe</th><th className="px-3 py-2 text-right">Win rate</th><th className="px-3 py-2 text-right">Trades</th></tr></thead>
              <tbody>
                {result.results.map((r, i) => r.error ? (
                  <tr key={i} className="border-b border-line/60"><td className="px-3 py-2 font-semibold">{r.strategy.type}</td><td colSpan={6} className="px-3 py-2 text-down" role="alert">{r.error.message}</td></tr>
                ) : (
                  <tr key={i} className="border-b border-line/60">
                    <td className="px-3 py-2 font-semibold"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: COMPARE_COLORS[i % COMPARE_COLORS.length] }} aria-hidden />{r.strategy.name}</td>
                    <td className="px-3 py-2 text-right">{money(r.metrics!.final_equity, result.instrument.currency, 0)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${toneClass(r.metrics!.total_return_pct)}`}>{pct(r.metrics!.total_return_pct, 2, true)}</td>
                    <td className="px-3 py-2 text-right text-down">{pct(-r.metrics!.max_drawdown_pct, 2)}</td>
                    <td className="px-3 py-2 text-right">{ratio(r.metrics!.sharpe_ratio)}</td><td className="px-3 py-2 text-right">{pct(r.metrics!.win_rate_pct, 1)}</td><td className="px-3 py-2 text-right">{r.metrics!.closed_trades}</td>
                  </tr>))}
                {result.results.find((r) => r.metrics) && (
                  <tr className="bg-surface-2/60"><td className="px-3 py-2 font-semibold text-muted">Buy &amp; hold benchmark</td>
                    <td className="px-3 py-2 text-right">{money(result.results.find((r) => r.metrics)!.metrics!.buy_hold_final_equity, result.instrument.currency, 0)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${toneClass(result.results.find((r) => r.metrics)!.metrics!.buy_hold_return_pct)}`}>{pct(result.results.find((r) => r.metrics)!.metrics!.buy_hold_return_pct, 2, true)}</td>
                    <td colSpan={4} /></tr>)}
              </tbody></table></div>
          </Panel>
        </>
      )}
      {!busy && !result && !error && <Panel><EmptyState icon={<GitCompare className="h-6 w-6" />} title="No comparison yet" text="Choose strategies above and press Compare." /></Panel>}
    </div>
  );
}
