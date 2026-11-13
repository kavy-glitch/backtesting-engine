import { useRef, useState } from "react";
import { CloudDownload, Database, Plus, Trash2, Upload } from "lucide-react";
import { api, ApiError } from "../api/client";
import type { ImportSummary, Instrument } from "../api/types";
import { Button, EmptyState, ErrorState, Field, Input, Modal, Notice, Panel, Select, Skeleton, SyntheticBadge, SectionTag } from "../components/ui";
import { date, integer } from "../lib/format";
import { useAsync, useToast } from "../lib/hooks";

const today = () => new Date().toISOString().slice(0, 10);
const yearsAgo = (n: number) => { const d = new Date(); d.setFullYear(d.getFullYear() - n); return d.toISOString().slice(0, 10); };
type Dialog = { kind: "fetch-new" } | { kind: "create" } | { kind: "csv"; inst: Instrument } | { kind: "fetch"; inst: Instrument } | { kind: "delete"; inst: Instrument } | null;

export function DataPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => api.instruments(), []);
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const done = (msg: string) => { toast.push("success", msg); close(); reload(); };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><SectionTag n={6} name="market data" note="validated candles" /><h1 className="text-2xl font-extrabold">Market data</h1><p className="text-sm text-muted">Daily OHLCV candles. Everything is validated before it is stored; invalid files are rejected with row-level errors.</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setDialog({ kind: "create" })}>New instrument</Button>
          <Button icon={<CloudDownload className="h-4 w-4" />} onClick={() => setDialog({ kind: "fetch-new" })}>Fetch from Yahoo Finance</Button>
        </div>
      </div>
      <Notice tone="info">Yahoo Finance data comes from the unofficial <code>yfinance</code> library (personal and educational use) and is split/dividend adjusted. If it is unavailable, import a CSV instead. Demo instruments are labelled <b>SYNTHETIC</b>.</Notice>

      <Panel>
        {loading ? <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading instruments">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
          : error || !data ? <ErrorState message={error?.message ?? "Could not load instruments"} onRetry={reload} />
          : data.length === 0 ? <EmptyState icon={<Database className="h-6 w-6" />} title="No instruments yet" text="Fetch a ticker from Yahoo Finance (for example RELIANCE.NS), or create an instrument and import a CSV file. To load the bundled synthetic demo set, run: python -m scripts.load_demo_data" />
          : (
            <div className="overflow-x-auto"><table className="num w-full min-w-[820px] text-sm">
              <thead className="border-b border-line bg-surface-2 text-xs uppercase tracking-wide text-muted"><tr>
                <th className="px-4 py-2 text-left">Symbol</th><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-right">Candles</th><th className="px-3 py-2 text-left">Coverage</th><th className="px-4 py-2 text-right">Actions</th></tr></thead>
              <tbody>{data.map((i) => (
                <tr key={i.id} className="border-b border-line/60">
                  <td className="px-4 py-3"><div className="flex items-center gap-2 font-semibold">{i.symbol}{i.is_synthetic && <SyntheticBadge />}</div><div className="text-xs text-muted">{i.exchange ?? i.asset_class} · {i.currency}</div></td>
                  <td className="max-w-[280px] truncate px-3 py-3 text-muted">{i.name ?? "–"}</td>
                  <td className="px-3 py-3 text-right">{integer(i.candle_count)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted">{i.candle_count ? `${date(i.first_date)} → ${date(i.last_date)}` : "No data"}</td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-1">
                    <Button variant="ghost" className="!px-2.5 !py-1.5 !text-xs" icon={<Upload className="h-3.5 w-3.5" />} onClick={() => setDialog({ kind: "csv", inst: i })} aria-label={`Import CSV for ${i.symbol}`}>CSV</Button>
                    {!i.is_synthetic && <Button variant="ghost" className="!px-2.5 !py-1.5 !text-xs" icon={<CloudDownload className="h-3.5 w-3.5" />} onClick={() => setDialog({ kind: "fetch", inst: i })} aria-label={`Fetch data for ${i.symbol}`}>Fetch</Button>}
                    <Button variant="ghost" className="!px-2.5 !py-1.5 !text-xs !text-down" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setDialog({ kind: "delete", inst: i })} aria-label={`Delete ${i.symbol}`}>Delete</Button>
                  </div></td></tr>))}</tbody></table></div>)}
      </Panel>

      {dialog?.kind === "fetch-new" && <FetchNewModal onClose={close} onDone={(s) => done(`Loaded ${s.rows_inserted + s.rows_updated} candles`)} />}
      {dialog?.kind === "create" && <CreateModal onClose={close} onDone={(sym) => done(`Created ${sym}. Now import a CSV for it.`)} />}
      {dialog?.kind === "csv" && <CsvModal inst={dialog.inst} onClose={close} onDone={reload} />}
      {dialog?.kind === "fetch" && <FetchExistingModal inst={dialog.inst} onClose={close} onDone={(s) => done(`Updated ${dialog.inst.symbol}: ${s.rows_inserted} new, ${s.rows_updated} updated`)} />}
      {dialog?.kind === "delete" && <DeleteModal inst={dialog.inst} onClose={close} onDone={() => done(`Deleted ${dialog.inst.symbol}`)} />}
    </div>
  );
}

function useSubmit<T>(action: () => Promise<T>, onOk: (r: T) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const submit = async () => {
    setBusy(true); setError(null);
    try { onOk(await action()); } catch (e) { setError(e as Error); } finally { setBusy(false); }
  };
  return { busy, error, submit };
}

function ServerError({ error }: { error: ApiError | Error | null }) {
  if (!error) return null;
  const details = error instanceof ApiError && Array.isArray(error.details) ? (error.details as { row?: number; field?: string; message: string }[]) : [];
  return (
    <Notice tone="error">
      <div className="font-semibold">{error.message}</div>
      {details.length > 0 && <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5 text-xs">{details.map((d, i) => <li key={i}>{d.row !== undefined ? `Row ${d.row}: ` : d.field ? `${d.field}: ` : ""}{d.message}</li>)}</ul>}
    </Notice>
  );
}

function FetchNewModal({ onClose, onDone }: { onClose: () => void; onDone: (s: ImportSummary) => void }) {
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [start, setStart] = useState(yearsAgo(5));
  const [end, setEnd] = useState(today());
  const [currency, setCurrency] = useState("INR");
  const sym = symbol.trim();
  const problem = !sym ? "Enter a ticker, e.g. RELIANCE.NS" : !/^[A-Za-z0-9.^_=-]+$/.test(sym) ? "Ticker contains invalid characters" : end < start ? "End date must not be before the start date" : null;
  const { busy, error, submit } = useSubmit(() => api.fetchSymbol({ symbol: sym, name: name.trim() || undefined, currency, start_date: start, end_date: end }), onDone);
  return (
    <Modal title="Fetch from Yahoo Finance" onClose={onClose}>
      <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); if (!problem) void submit(); }}>
        <Field label="Ticker" error={sym ? problem ?? undefined : undefined} hint="NSE stocks end in .NS (RELIANCE.NS), BSE in .BO, indices start with ^ (^NSEI)" htmlFor="f-symbol"><Input id="f-symbol" autoFocus value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="RELIANCE.NS" /></Field>
        <Field label="Display name (optional)" htmlFor="f-name"><Input id="f-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="From" htmlFor="f-start"><Input id="f-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="To" htmlFor="f-end"><Input id="f-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          <Field label="Currency" htmlFor="f-cur"><Select id="f-cur" value={currency} onChange={(e) => setCurrency(e.target.value)}><option>INR</option><option>USD</option></Select></Field>
        </div>
        <ServerError error={error} />
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy} disabled={!!problem}>Download</Button></div>
      </form>
    </Modal>
  );
}

function FetchExistingModal({ inst, onClose, onDone }: { inst: Instrument; onClose: () => void; onDone: (s: ImportSummary) => void }) {
  const [start, setStart] = useState(inst.first_date ?? yearsAgo(5));
  const [end, setEnd] = useState(today());
  const bad = end < start;
  const { busy, error, submit } = useSubmit(() => api.fetchForInstrument(inst.id, start, end), onDone);
  return (
    <Modal title={`Fetch ${inst.symbol}`} onClose={onClose}>
      <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); if (!bad) void submit(); }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From" htmlFor="fe-start"><Input id="fe-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="To" error={bad ? "End date must not be before the start date" : undefined} htmlFor="fe-end"><Input id="fe-end" type="date" value={end} error={bad} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <p className="text-xs text-muted">Existing dates are overwritten with the freshly downloaded values.</p>
        <ServerError error={error} />
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy} disabled={bad}>Download</Button></div>
      </form>
    </Modal>
  );
}

function CreateModal({ onClose, onDone }: { onClose: () => void; onDone: (symbol: string) => void }) {
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("INR");
  const sym = symbol.trim();
  const problem = !sym ? "Enter a symbol" : !/^[A-Za-z0-9.^_=-]+$/.test(sym) ? "Use letters, digits and . ^ _ = - only" : null;
  const { busy, error, submit } = useSubmit(() => api.createInstrument({ symbol: sym, name: name.trim() || undefined, currency }), (i) => onDone(i.symbol));
  return (
    <Modal title="New instrument" onClose={onClose}>
      <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); if (!problem) void submit(); }}>
        <Field label="Symbol" error={sym ? problem ?? undefined : undefined} htmlFor="c-symbol"><Input id="c-symbol" autoFocus value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="TCS.NS" /></Field>
        <Field label="Name (optional)" htmlFor="c-name"><Input id="c-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Currency" htmlFor="c-cur"><Select id="c-cur" value={currency} onChange={(e) => setCurrency(e.target.value)}><option>INR</option><option>USD</option></Select></Field>
        <ServerError error={error} />
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy} disabled={!!problem}>Create</Button></div>
      </form>
    </Modal>
  );
}

function CsvModal({ inst, onClose, onDone }: { inst: Instrument; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"skip" | "replace">("skip");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const { busy, error, submit } = useSubmit(() => api.importCsv(inst.id, file!, mode), (s) => { setSummary(s); onDone(); toast.push("success", `Imported ${s.rows_inserted} new candles into ${inst.symbol}`); });
  const tooBig = !!file && file.size > 10 * 1024 * 1024;
  return (
    <Modal title={`Import CSV into ${inst.symbol}`} onClose={onClose} wide>
      {summary ? (
        <div className="space-y-3" data-testid="import-summary">
          <Notice tone="info"><b>{summary.rows_inserted} inserted</b>, {summary.rows_updated} updated, {summary.rows_skipped} skipped ({summary.first_date} → {summary.last_date}).</Notice>
          {summary.warnings.map((w, i) => <Notice key={i} tone="warn">{w}</Notice>)}
          <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
        </div>
      ) : (
        <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); if (file && !tooBig) void submit(); }}>
          <p className="text-sm text-muted">Required header: <code>Date,Open,High,Low,Close,Volume</code> (extra columns such as Adj Close are ignored). Dates must be <code>YYYY-MM-DD</code>.</p>
          <Field label="CSV file" error={tooBig ? "File is larger than 10 MB" : undefined} htmlFor="csv-file">
            <input id="csv-file" ref={fileRef} type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary" />
          </Field>
          <Field label="If a date already exists" htmlFor="csv-mode"><Select id="csv-mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="skip">Keep the stored candle (skip)</option><option value="replace">Overwrite with the file</option></Select></Field>
          <ServerError error={error} />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy} disabled={!file || tooBig} icon={<Upload className="h-4 w-4" />}>Validate &amp; import</Button></div>
        </form>
      )}
    </Modal>
  );
}

function DeleteModal({ inst, onClose, onDone }: { inst: Instrument; onClose: () => void; onDone: () => void }) {
  const { busy, error, submit } = useSubmit(() => api.deleteInstrument(inst.id), onDone);
  return (
    <Modal title={`Delete ${inst.symbol}?`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm">This permanently removes the instrument and its {integer(inst.candle_count)} stored candles. Instruments that have saved backtests cannot be deleted until those are deleted.</p>
        <ServerError error={error} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" busy={busy} onClick={() => void submit()}>Delete</Button></div>
      </div>
    </Modal>
  );
}
