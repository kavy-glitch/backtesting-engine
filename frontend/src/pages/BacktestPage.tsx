import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { BarChart3, Database } from "lucide-react";
import { api, ApiError } from "../api/client";
import type { BacktestResult } from "../api/types";
import { BacktestForm } from "../components/backtest/BacktestForm";
import { ResultsView } from "../components/backtest/ResultsView";
import { Button, EmptyState, ErrorState, Field, Input, Modal, Notice, Panel, Skeleton } from "../components/ui";
import { useAsync, useToast } from "../lib/hooks";
import { defaultForm, formFromResult, toRequest } from "../lib/request";
import { validateConfig, type ConfigForm } from "../lib/validation";

export function BacktestPage() {
  const { id } = useParams();
  return id ? <SavedRun id={Number(id)} /> : <Workspace />;
}

function Workspace() {
  const toast = useToast();
  const location = useLocation();
  const prefill = (location.state as { prefill?: BacktestResult } | null)?.prefill;
  const lists = useAsync(() => Promise.all([api.instruments(), api.strategies(), api.savedStrategies()]), []);
  const [form, setForm] = useState<ConfigForm | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [savingStrategy, setSavingStrategy] = useState(false);

  const [instruments, strategies, saved] = lists.data ?? [[], [], []];
  useEffect(() => {
    if (lists.data && !form) setForm(prefill ? formFromResult(prefill) : defaultForm(lists.data[0], lists.data[1]));
  }, [lists.data, form, prefill]);

  const specs = strategies.find((s) => s.type === form?.strategy)?.params ?? [];
  const inst = instruments.find((i) => String(i.id) === form?.instrumentId);
  const errors = useMemo(() => (form ? validateConfig(form, specs, { first: inst?.first_date ?? null, last: inst?.last_date ?? null }) : {}), [form, specs, inst]);

  if (lists.loading || (!form && !lists.error)) return <WorkspaceSkeleton />;
  if (lists.error || !form) return <ErrorState message={lists.error?.message ?? "Could not load data"} onRetry={lists.reload} />;
  if (!instruments.length)
    return <Panel><EmptyState icon={<Database className="h-6 w-6" />} title="Add market data first" text="Backtests run on historical prices. Load the demo data, fetch a ticker from Yahoo Finance, or import a CSV file."
      action={<Link to="/data"><Button>Go to market data</Button></Link>} /></Panel>;

  const run = async () => {
    setRunning(true); setRunError(null);
    try {
      const r = await api.runBacktest(toRequest(form));
      setResult(r);
      toast.push("success", `Backtest complete: ${r.trades.length} trade${r.trades.length === 1 ? "" : "s"}, total return ${r.metrics.total_return_pct.toFixed(2)}%`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Unexpected error";
      setRunError(msg); toast.push("error", msg);
    } finally { setRunning(false); }
  };
  const save = async () => {
    setSaving(true);
    try {
      const r = await api.saveBacktest(toRequest(form));
      setResult(r);
      toast.push("success", `Saved as backtest #${r.id}. You can find it under History.`);
    } catch (e) { toast.push("error", e instanceof ApiError ? e.message : "Could not save the backtest"); }
    finally { setSaving(false); }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      <Panel title="Backtest setup" className="self-start xl:sticky xl:top-20 xl:max-h-[calc(100vh-6.5rem)] xl:overflow-y-auto">
        <BacktestForm form={form} errors={errors} instruments={instruments} strategies={strategies} saved={saved} running={running} saving={saving}
          canSave={!!result && !running} onChange={(f) => { setForm(f); }} onRun={run} onSave={save} onSaveStrategy={() => setSavingStrategy(true)} />
      </Panel>
      <div className="min-w-0 space-y-4">
        {runError && <Notice tone="error"><b>Backtest failed.</b> {runError}</Notice>}
        {running ? <ResultsSkeleton /> : result ? <ResultsView result={result} /> : (
          <Panel><EmptyState icon={<BarChart3 className="h-6 w-6" />} title="Ready when you are" text="Choose an instrument and a strategy on the left, then press “Run backtest”. Results, charts and trades appear here." /></Panel>
        )}
      </div>
      {savingStrategy && <SaveStrategyModal form={form} onClose={() => setSavingStrategy(false)} onSaved={lists.reload} />}
    </div>
  );
}

function SaveStrategyModal({ form, onClose, onSaved }: { form: ConfigForm; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!name.trim()) { setError("Enter a name"); return; }
    setBusy(true); setError(null);
    try {
      await api.createSavedStrategy({ name: name.trim(), strategy_type: form.strategy, params: Object.fromEntries(Object.entries(form.params).map(([k, v]) => [k, Number(v)])) });
      toast.push("success", `Strategy “${name.trim()}” saved`); onSaved(); onClose();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not save"); } finally { setBusy(false); }
  };
  return (
    <Modal title="Save strategy" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-4">
        <Field label="Name" error={error ?? undefined} htmlFor="strategy-name"><Input id="strategy-name" autoFocus value={name} maxLength={80} error={!!error} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fast SMA 5/20" /></Field>
        <p className="text-xs text-muted">Saves the strategy type and its parameters. Capital, costs and dates are not part of a saved strategy.</p>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy}>Save strategy</Button></div>
      </form>
    </Modal>
  );
}

function SavedRun({ id }: { id: number }) {
  const nav = useNavigate();
  const { data, error, loading, reload } = useAsync(() => api.run(id), [id]);
  if (loading) return <ResultsSkeleton />;
  if (error || !data) return <ErrorState message={error instanceof ApiError && error.status === 404 ? "This backtest does not exist (it may have been deleted)." : error?.message ?? "Could not load the backtest"} onRetry={reload} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Link to="/history"><Button variant="secondary">← History</Button></Link>
        <Button onClick={() => nav("/backtest", { state: { prefill: data } })}>Use these settings in a new backtest</Button>
      </div>
      <ResultsView result={data} />
    </div>
  );
}

function WorkspaceSkeleton() {
  return <div className="grid gap-5 xl:grid-cols-[380px_1fr]" aria-busy="true" aria-label="Loading"><Skeleton className="h-[640px]" /><div className="space-y-4"><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-[460px]" /></div></div>;
}
export function ResultsSkeleton() {
  return <div className="space-y-4" aria-busy="true" aria-label="Running backtest"><Skeleton className="h-7 w-72" /><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-[480px]" /></div>;
}
