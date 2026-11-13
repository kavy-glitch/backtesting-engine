import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { Trade } from "../../api/types";
import { date, money, pct, price, qty, toneClass } from "../../lib/format";
import { Badge, Button, EmptyState, Select, cx } from "../ui";

type SortKey = "trade_no" | "entry_date" | "exit_date" | "net_pnl" | "return_pct" | "holding_days";
const PAGE_SIZES = [10, 25, 50];

function Th({ k, children, right, sort, onSort }: { k?: SortKey; children: string; right?: boolean; sort: { key: SortKey; dir: "asc" | "desc" }; onSort: (k: SortKey) => void }) {
  return (
    <th scope="col" aria-sort={k && sort.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
      className={cx("whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted", right ? "text-right" : "text-left")}>
      {k ? (
        <button onClick={() => onSort(k)} className="inline-flex items-center gap-1 hover:text-ink">
          {children}{sort.key === k && (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />)}
        </button>
      ) : children}
    </th>
  );
}

export function TradeTable({ trades, currency }: { trades: Trade[]; currency: string }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "trade_no", dir: "asc" });
  const [result, setResult] = useState<"all" | "win" | "loss">("all");
  const [reason, setReason] = useState<"all" | Trade["exit_reason"]>("all");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Trade | null>(null);

  const rows = useMemo(() => {
    const f = trades.filter((t) => (result === "all" || (result === "win" ? t.net_pnl > 0 : t.net_pnl < 0)) && (reason === "all" || t.exit_reason === reason));
    const m = sort.dir === "asc" ? 1 : -1;
    return [...f].sort((a, b) => {
      const x = a[sort.key], y = b[sort.key];
      return (x < y ? -1 : x > y ? 1 : 0) * m || a.trade_no - b.trade_no;
    });
  }, [trades, sort, result, reason]);

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages);
  const slice = rows.slice((current - 1) * pageSize, current * pageSize);
  const toggle = (key: SortKey) => { setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" })); setPage(1); };

  if (!trades.length) return <EmptyState title="No trades" text="The strategy did not open any position in this period. Try a different period, strategy, or parameters." />;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 px-4 py-3">
        <label className="text-xs font-semibold text-muted">Result
          <Select aria-label="Filter by result" value={result} onChange={(e) => { setResult(e.target.value as typeof result); setPage(1); }} className="mt-1 !py-1.5">
            <option value="all">All trades</option><option value="win">Winners</option><option value="loss">Losers</option>
          </Select>
        </label>
        <label className="text-xs font-semibold text-muted">Exit reason
          <Select aria-label="Filter by exit reason" value={reason} onChange={(e) => { setReason(e.target.value as typeof reason); setPage(1); }} className="mt-1 !py-1.5">
            <option value="all">Any</option><option value="signal">Signal</option><option value="stop_loss">Stop-loss</option><option value="take_profit">Take-profit</option><option value="open">Still open</option>
          </Select>
        </label>
        <div className="num ml-auto text-xs text-muted" data-testid="trade-count">{rows.length} of {trades.length} trades</div>
      </div>
      <div className="overflow-x-auto">
        <table className="num w-full min-w-[920px] text-sm">
          <thead className="border-y border-line bg-surface-2">
            <tr><Th sort={sort} onSort={toggle} k="trade_no">#</Th><Th sort={sort} onSort={toggle}>Side</Th><Th sort={sort} onSort={toggle} k="entry_date">Entry</Th><Th sort={sort} onSort={toggle} k="exit_date">Exit</Th><Th sort={sort} onSort={toggle} right>Qty</Th><Th sort={sort} onSort={toggle} right>Entry price</Th><Th sort={sort} onSort={toggle} right>Exit price</Th><Th sort={sort} onSort={toggle} right>Fees</Th>
              <Th sort={sort} onSort={toggle} k="net_pnl" right>Net P&amp;L</Th><Th sort={sort} onSort={toggle} k="return_pct" right>Return</Th><Th sort={sort} onSort={toggle} k="holding_days" right>Days</Th><Th sort={sort} onSort={toggle}>Exit</Th></tr>
          </thead>
          <tbody>
            {slice.map((t) => (
              <tr key={t.trade_no} onClick={() => setSelected(t)} className="cursor-pointer border-b border-line/60 hover:bg-surface-2">
                <td className="px-3 py-2"><button className="font-semibold text-accent hover:underline" onClick={(e) => { e.stopPropagation(); setSelected(t); }} aria-label={`Details for trade ${t.trade_no}`}>{t.trade_no}</button></td>
                <td className="px-3 py-2"><Badge tone="up">{t.direction}</Badge></td>
                <td className="whitespace-nowrap px-3 py-2">{date(t.entry_date)}</td>
                <td className="whitespace-nowrap px-3 py-2">{t.status === "open" ? <Badge tone="accent">OPEN · {date(t.exit_date)}</Badge> : date(t.exit_date)}</td>
                <td className="px-3 py-2 text-right">{qty(t.quantity)}</td>
                <td className="px-3 py-2 text-right">{price(t.entry_price)}</td>
                <td className="px-3 py-2 text-right">{price(t.exit_price)}{t.status === "open" && <span className="text-muted"> (last)</span>}</td>
                <td className="px-3 py-2 text-right">{price(t.entry_fee + t.exit_fee)}</td>
                <td className={cx("px-3 py-2 text-right font-semibold", toneClass(t.net_pnl))}>{money(t.net_pnl, currency)}</td>
                <td className={cx("px-3 py-2 text-right", toneClass(t.return_pct))}>{pct(t.return_pct, 2, true)}</td>
                <td className="px-3 py-2 text-right">{t.holding_days}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted">{t.exit_reason.replace("_", " ")}</td>
              </tr>
            ))}
            {!slice.length && <tr><td colSpan={12} className="px-3 py-10 text-center text-muted">No trades match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
        <label className="flex items-center gap-2 text-xs text-muted">Rows per page
          <Select aria-label="Rows per page" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="!w-20 !py-1.5">
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </label>
        <div className="flex items-center gap-2">
          <Button variant="secondary" className="!px-2.5 !py-1.5" aria-label="Previous page" disabled={current <= 1} onClick={() => setPage(current - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="num text-xs" data-testid="page-indicator">Page {current} of {pages}</span>
          <Button variant="secondary" className="!px-2.5 !py-1.5" aria-label="Next page" disabled={current >= pages} onClick={() => setPage(current + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      {selected && <TradeDetail trade={selected} currency={currency} onClose={() => setSelected(null)} />}
    </div>
  );
}

function TradeDetail({ trade: t, currency, onClose }: { trade: Trade; currency: string; onClose: () => void }) {
  const rows: [string, string][] = [
    ["Direction", t.direction], ["Status", t.status === "open" ? "Open (marked to last close)" : "Closed"],
    ["Entry", `${date(t.entry_date)} @ ${price(t.entry_price)}`], [t.status === "open" ? "Last close" : "Exit", `${date(t.exit_date)} @ ${price(t.exit_price)}`],
    ["Quantity", qty(t.quantity)], ["Entry fee", money(t.entry_fee, currency)], ["Exit fee", t.status === "open" ? "– (not yet paid)" : money(t.exit_fee, currency)],
    ["Gross P&L", money(t.gross_pnl, currency)], ["Net P&L", money(t.net_pnl, currency)], ["Return on cost", pct(t.return_pct, 2, true)],
    ["Holding period", `${t.holding_days} day${t.holding_days === 1 ? "" : "s"}`], ["Exit reason", t.exit_reason.replace("_", " ")],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={`Trade ${t.trade_no} details`} className="card w-full max-w-md rounded-b-none p-5 sm:rounded-b-2xl">
        <div className="mb-3 flex items-center justify-between"><h3 className="text-base font-bold">Trade #{t.trade_no}</h3>
          <button onClick={onClose} aria-label="Close trade details" className="rounded-lg p-1.5 text-muted hover:bg-surface-2"><X className="h-5 w-5" /></button></div>
        <dl className="num grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}
        </dl>
      </div>
    </div>
  );
}
