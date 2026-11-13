import { useState } from "react";
import { Download } from "lucide-react";
import { api } from "../../api/client";
import type { BacktestResult } from "../../api/types";
import { date, money, pct, ratio, tone } from "../../lib/format";
import { CandleChart, DailyReturnsChart, EquityChart, TradePnlChart } from "../charts";
import { MetricsTable } from "./MetricsTable";
import { TradeTable } from "./TradeTable";
import { Notice, Panel, StatCard, SyntheticBadge, Tabs } from "../ui";

type Tab = "price" | "equity" | "trades" | "analysis" | "metrics";

export function SummaryCards({ r }: { r: BacktestResult }) {
  const m = r.metrics, cur = r.instrument.currency;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-4">
      <StatCard label="Initial capital" value={money(m.initial_capital, cur, 0)} />
      <StatCard label="Final portfolio value" value={money(m.final_equity, cur, 0)} tone={tone(m.net_profit)} sub={`Buy & hold ${money(m.buy_hold_final_equity, cur, 0)}`} />
      <StatCard label="Net profit / loss" value={money(m.net_profit, cur, 0)} tone={tone(m.net_profit)} sub={`Fees ${money(m.total_fees, cur, 0)}`} />
      <StatCard label="Total return" value={pct(m.total_return_pct, 2, true)} tone={tone(m.total_return_pct)} sub={`Buy & hold ${pct(m.buy_hold_return_pct, 2, true)}`} />
      <StatCard label="Max drawdown" value={pct(-m.max_drawdown_pct, 2)} tone={m.max_drawdown_pct > 0 ? "down" : "flat"} sub="Peak-to-trough" />
      <StatCard label="Win rate" value={pct(m.win_rate_pct, 1)} sub={m.win_rate_pct === null ? "No closed trades" : `${m.winning_trades} of ${m.closed_trades} trades`} hint={m.notes.win_rate_pct} />
      <StatCard label="Total trades" value={String(m.closed_trades + (r.trades.some((t) => t.status === "open") ? 1 : 0))} sub={`${m.closed_trades} closed${r.trades.some((t) => t.status === "open") ? " · 1 open" : ""}`} />
      <StatCard label="Sharpe ratio" value={ratio(m.sharpe_ratio)} sub={m.sharpe_ratio === null ? "Not computable" : `Sortino ${ratio(m.sortino_ratio)}`} hint={m.notes.sharpe_ratio} />
    </div>
  );
}

export function ResultsView({ result: r }: { result: BacktestResult }) {
  const [tab, setTab] = useState<Tab>("price");
  const cur = r.instrument.currency;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-lg font-bold">{r.name || `${r.strategy.name} on ${r.instrument.symbol}`}</h2>
        {r.instrument.is_synthetic && <SyntheticBadge />}
        <span className="num text-sm text-muted">{r.instrument.symbol} · {date(r.period.start)} → {date(r.period.end)} · {r.period.candles} daily candles</span>
        {r.id !== null && (
          <span className="ml-auto flex flex-wrap gap-2 text-xs" aria-label="Exports">
            {(["trades", "equity", "metrics", "summary"] as const).map((k) => (
              <a key={k} href={api.exportUrl(r.id!, k)} download className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 font-semibold text-muted hover:bg-surface-2 hover:text-ink">
                <Download className="h-3.5 w-3.5" aria-hidden /> {k}.csv
              </a>
            ))}
          </span>
        )}
      </div>
      {r.instrument.is_synthetic && <Notice tone="warn"><b>Synthetic data.</b> These prices are generated for demonstration and are not real market prices; the results say nothing about real trading.</Notice>}
      {r.warnings.map((w, i) => <Notice key={i} tone="warn">{w}</Notice>)}
      {r.rejected_orders.length > 0 && (
        <Notice tone="warn"><b>{r.rejected_orders.length} order{r.rejected_orders.length > 1 ? "s were" : " was"} rejected.</b>
          <ul className="mt-1 list-disc pl-5 text-xs">{r.rejected_orders.slice(0, 3).map((o, i) => <li key={i}>{o}</li>)}{r.rejected_orders.length > 3 && <li>…and {r.rejected_orders.length - 3} more</li>}</ul></Notice>
      )}
      <SummaryCards r={r} />
      <Panel>
        <div className="border-b border-line p-3">
          <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: "price", label: "Price & signals" }, { id: "equity", label: "Equity & drawdown" }, { id: "trades", label: `Trades (${r.trades.length})` }, { id: "analysis", label: "Returns & trade analysis" }, { id: "metrics", label: "All metrics" }]} />
        </div>
        {tab === "price" && <CandleChart candles={r.candles} indicators={r.indicators} trades={r.trades} currency={cur} />}
        {tab === "equity" && <EquityChart equity={r.equity} currency={cur} />}
        {tab === "trades" && <TradeTable trades={r.trades} currency={cur} />}
        {tab === "analysis" && (
          <div className="grid gap-4 p-4 lg:grid-cols-2">
            <div><h3 className="mb-2 text-sm font-bold">Daily returns (%)</h3><DailyReturnsChart equity={r.equity} /></div>
            <div><h3 className="mb-2 text-sm font-bold">Net P&amp;L per closed trade</h3><TradePnlChart trades={r.trades} /></div>
          </div>
        )}
        {tab === "metrics" && <MetricsTable m={r.metrics} currency={cur} />}
      </Panel>
    </div>
  );
}
