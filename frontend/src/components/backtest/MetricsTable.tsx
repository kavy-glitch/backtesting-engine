import type { Metrics } from "../../api/types";
import { integer, money, pct, ratio } from "../../lib/format";
import { Notice } from "../ui";

export function MetricsTable({ m, currency }: { m: Metrics; currency: string }) {
  const note = (k: string) => m.notes[k];
  const groups: { title: string; rows: [string, string, string | undefined][] }[] = [
    { title: "Returns", rows: [
      ["Initial capital", money(m.initial_capital, currency), undefined], ["Final equity", money(m.final_equity, currency), undefined],
      ["Net profit / loss", money(m.net_profit, currency), undefined], ["Total return", pct(m.total_return_pct, 2, true), undefined],
      ["Annualised return (CAGR)", pct(m.cagr_pct, 2, true), note("cagr_pct")], ["Buy & hold return", pct(m.buy_hold_return_pct, 2, true), undefined],
      ["Realised P&L", money(m.realized_pnl, currency), undefined], ["Unrealised P&L (open position)", money(m.unrealized_pnl, currency), undefined],
      ["Total fees paid", money(m.total_fees, currency), undefined] ] },
    { title: "Risk", rows: [
      ["Max drawdown", pct(-m.max_drawdown_pct, 2), undefined], ["Annual volatility", pct(m.annual_volatility_pct), note("annual_volatility_pct")],
      ["Sharpe ratio", ratio(m.sharpe_ratio), note("sharpe_ratio")], ["Sortino ratio", ratio(m.sortino_ratio), note("sortino_ratio")],
      ["Time in market", pct(m.exposure_pct, 1), undefined] ] },
    { title: "Trades", rows: [
      ["Closed trades", integer(m.closed_trades), undefined], ["Winning / losing / breakeven", `${m.winning_trades} / ${m.losing_trades} / ${m.breakeven_trades}`, undefined],
      ["Win rate", pct(m.win_rate_pct, 1), note("win_rate_pct")], ["Average trade return", pct(m.avg_trade_return_pct, 2, true), note("avg_trade_return_pct")],
      ["Average win", money(m.avg_win, currency), note("avg_win")], ["Average loss", money(m.avg_loss, currency), note("avg_loss")],
      ["Profit factor", ratio(m.profit_factor), note("profit_factor")] ] },
  ];
  return (
    <div className="space-y-4 p-4">
      {m.notes.sample_size && <Notice tone="warn">{m.notes.sample_size}</Notice>}
      <div className="grid gap-4 lg:grid-cols-3">
        {groups.map((g) => (
          <div key={g.title}>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{g.title}</h3>
            <dl className="num divide-y divide-line/60 rounded-xl border border-line text-sm">
              {g.rows.map(([k, v, why]) => (
                <div key={k} className="flex items-start justify-between gap-3 px-3 py-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-semibold">{v}{v === "–" && why && <div className="mt-0.5 max-w-[16rem] text-[11px] font-normal text-muted">{why}</div>}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
