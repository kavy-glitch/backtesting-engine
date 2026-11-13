import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, History, Trash2 } from "lucide-react";
import { api } from "../api/client";
import type { RunSummary } from "../api/types";
import { Button, EmptyState, ErrorState, Modal, Panel, Select, Skeleton, SyntheticBadge, SectionTag } from "../components/ui";
import { date, dateTime, money, pct, ratio, toneClass } from "../lib/format";
import { useAsync, useToast } from "../lib/hooks";

const SORTS: [string, string][] = [["created_at", "Date saved"], ["total_return_pct", "Total return"], ["max_drawdown_pct", "Max drawdown"], ["sharpe_ratio", "Sharpe ratio"], ["net_profit", "Net profit"], ["closed_trades", "Trades"]];

export function HistoryPage() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [instrumentId, setInstrumentId] = useState("");
  const [strategy, setStrategy] = useState("");
  const [sort, setSort] = useState("created_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [toDelete, setToDelete] = useState<RunSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filters = useAsync(() => Promise.all([api.instruments(), api.strategies()]), []);
  const runs = useAsync(() => api.runs({ page, page_size: pageSize, instrument_id: instrumentId ? Number(instrumentId) : undefined, strategy_type: strategy || undefined, sort, order }), [page, pageSize, instrumentId, strategy, sort, order]);
  const pages = runs.data ? Math.max(1, Math.ceil(runs.data.total / pageSize)) : 1;

  const del = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try { await api.deleteRun(toDelete.run_id); toast.push("success", `Deleted backtest #${toDelete.run_id}`); setToDelete(null); runs.reload(); }
    catch (e) { toast.push("error", (e as Error).message); } finally { setDeleting(false); }
  };
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  return (
    <div className="space-y-5">
      <div><SectionTag n={5} name="history" note="saved runs" /><h1 className="text-2xl font-extrabold">History</h1><p className="text-sm text-muted">Every saved backtest, stored in the database with its trades, equity curve and indicators.</p></div>
      <Panel>
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          <label className="text-xs font-semibold text-muted">Instrument<Select aria-label="Filter by instrument" value={instrumentId} onChange={(e) => reset(setInstrumentId)(e.target.value)} className="mt-1 !py-1.5"><option value="">All</option>{filters.data?.[0].map((i) => <option key={i.id} value={i.id}>{i.symbol}</option>)}</Select></label>
          <label className="text-xs font-semibold text-muted">Strategy<Select aria-label="Filter by strategy" value={strategy} onChange={(e) => reset(setStrategy)(e.target.value)} className="mt-1 !py-1.5"><option value="">All</option>{filters.data?.[1].map((s) => <option key={s.type} value={s.type}>{s.name}</option>)}</Select></label>
          <label className="text-xs font-semibold text-muted">Sort by<Select aria-label="Sort by" value={sort} onChange={(e) => reset(setSort)(e.target.value)} className="mt-1 !py-1.5">{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
          <label className="text-xs font-semibold text-muted">Order<Select aria-label="Sort order" value={order} onChange={(e) => reset(setOrder)(e.target.value as "asc" | "desc")} className="mt-1 !py-1.5"><option value="desc">High to low / newest</option><option value="asc">Low to high / oldest</option></Select></label>
          {runs.data && <div className="num ml-auto text-xs text-muted" data-testid="run-count">{runs.data.total} saved backtest{runs.data.total === 1 ? "" : "s"}</div>}
        </div>
        {runs.loading ? <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading history">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
          : runs.error || !runs.data ? <ErrorState message={runs.error?.message ?? "Could not load history"} onRetry={runs.reload} />
          : runs.data.items.length === 0 ? <EmptyState icon={<History className="h-6 w-6" />} title={instrumentId || strategy ? "No backtests match these filters" : "No saved backtests yet"} text={instrumentId || strategy ? "Try clearing a filter." : "Run a backtest and press Save. It will appear here."} action={!instrumentId && !strategy ? <Link to="/backtest"><Button>New backtest</Button></Link> : undefined} />
          : (
            <>
              <div className="overflow-x-auto"><table className="num w-full min-w-[960px] text-sm">
                <thead className="border-b border-line bg-surface-2 text-xs uppercase tracking-wide text-muted"><tr>
                  <th className="px-4 py-2 text-left">Backtest</th><th className="px-3 py-2 text-left">Period</th><th className="px-3 py-2 text-right">Final equity</th><th className="px-3 py-2 text-right">Return</th><th className="px-3 py-2 text-right">vs buy &amp; hold</th><th className="px-3 py-2 text-right">Max DD</th><th className="px-3 py-2 text-right">Sharpe</th><th className="px-3 py-2 text-right">Trades</th><th className="px-4 py-2" /></tr></thead>
                <tbody>{runs.data.items.map((r) => (
                  <tr key={r.run_id} className="border-b border-line/60 hover:bg-surface-2">
                    <td className="px-4 py-3"><Link to={`/backtest/${r.run_id}`} className="font-semibold hover:text-primary">{r.run_name || r.strategy_name}</Link><div className="flex items-center gap-2 text-xs text-muted">#{r.run_id} · {r.symbol}{r.is_synthetic && <SyntheticBadge />} · {dateTime(r.created_at)}</div></td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted">{date(r.start_date)} → {date(r.end_date)}</td>
                    <td className="px-3 py-3 text-right">{money(r.final_equity, "INR", 0)}</td>
                    <td className={`px-3 py-3 text-right font-semibold ${toneClass(r.total_return_pct)}`}>{pct(r.total_return_pct, 2, true)}</td>
                    <td className={`px-3 py-3 text-right ${toneClass(r.total_return_pct - r.buy_hold_return_pct)}`}>{pct(r.total_return_pct - r.buy_hold_return_pct, 2, true)}</td>
                    <td className="px-3 py-3 text-right text-down">{pct(-r.max_drawdown_pct, 2)}</td>
                    <td className="px-3 py-3 text-right">{ratio(r.sharpe_ratio)}</td><td className="px-3 py-3 text-right">{r.closed_trades}</td>
                    <td className="px-4 py-3 text-right"><div className="flex justify-end gap-1">
                      <Link to={`/backtest/${r.run_id}`}><Button variant="secondary" className="!px-3 !py-1.5 !text-xs">Open</Button></Link>
                      <Button variant="ghost" className="!px-2.5 !py-1.5 !text-xs !text-down" aria-label={`Delete backtest ${r.run_id}`} icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setToDelete(r)} />
                    </div></td></tr>))}</tbody></table></div>
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <label className="flex items-center gap-2 text-xs text-muted">Per page<Select aria-label="Backtests per page" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="!w-20 !py-1.5"><option>10</option><option>20</option><option>50</option></Select></label>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" className="!px-2.5 !py-1.5" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                  <span className="num text-xs" data-testid="history-page">Page {page} of {pages}</span>
                  <Button variant="secondary" className="!px-2.5 !py-1.5" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            </>)}
      </Panel>
      {toDelete && (
        <Modal title={`Delete backtest #${toDelete.run_id}?`} onClose={() => setToDelete(null)}>
          <p className="mb-4 text-sm">This removes the saved result, its trades, equity curve and indicators. It cannot be undone.</p>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setToDelete(null)}>Cancel</Button><Button variant="danger" busy={deleting} onClick={() => void del()}>Delete</Button></div>
        </Modal>)}
    </div>
  );
}
