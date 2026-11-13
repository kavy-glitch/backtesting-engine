import { useState } from "react";
import { Layers, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { Badge, Button, EmptyState, ErrorState, Modal, Panel, Skeleton, SectionTag } from "../components/ui";
import { dateTime } from "../lib/format";
import { useAsync, useToast } from "../lib/hooks";

export function StrategiesPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => Promise.all([api.strategies(), api.savedStrategies()]), []);
  const [toDelete, setToDelete] = useState<{ id: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const del = async () => {
    if (!toDelete) return;
    setBusy(true);
    try { await api.deleteSavedStrategy(toDelete.id); toast.push("success", `Deleted “${toDelete.name}”`); setToDelete(null); reload(); }
    catch (e) { toast.push("error", e instanceof ApiError ? e.message : "Could not delete"); } finally { setBusy(false); }
  };

  if (loading) return <div className="space-y-4" aria-busy="true" aria-label="Loading strategies"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>;
  if (error || !data) return <ErrorState message={error?.message ?? "Could not load strategies"} onRetry={reload} />;
  const [catalog, saved] = data;

  return (
    <div className="space-y-5">
      <div><SectionTag n={4} name="strategies" note="built-in and saved" /><h1 className="text-2xl font-extrabold">Strategies</h1><p className="text-sm text-muted">Built-in strategies run by the C++ engine, and your saved parameter sets.</p></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {catalog.map((s) => (
          <div key={s.type} className="card p-4">
            <div className="flex items-center justify-between gap-2"><h2 className="font-bold">{s.name}</h2><Badge>{s.type}</Badge></div>
            <p className="mt-1 text-sm text-muted">{s.description}</p>
            {s.params.length > 0 ? (
              <table className="num mt-3 w-full text-xs"><thead className="text-muted"><tr><th className="py-1 text-left">Parameter</th><th className="py-1 text-right">Default</th><th className="py-1 text-right">Range</th></tr></thead>
                <tbody>{s.params.map((p) => <tr key={p.key} className="border-t border-line/60"><td className="py-1">{p.label}</td><td className="py-1 text-right font-semibold">{p.default}</td><td className="py-1 text-right text-muted">{p.min}–{p.max}</td></tr>)}</tbody></table>
            ) : <p className="mt-3 text-xs text-muted">No parameters.</p>}
          </div>
        ))}
      </div>
      <Panel title="Saved strategies" action={<Link to="/backtest" className="text-sm font-semibold text-primary hover:underline">Create one on the Backtest page</Link>}>
        {saved.length === 0 ? <EmptyState icon={<Layers className="h-6 w-6" />} title="No saved strategies" text="Tune a strategy on the Backtest page and press “Save this strategy for reuse”." /> : (
          <div className="overflow-x-auto"><table className="num w-full min-w-[560px] text-sm">
            <thead className="border-b border-line bg-surface-2 text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-left">Parameters</th><th className="px-3 py-2 text-left">Saved</th><th className="px-4 py-2" /></tr></thead>
            <tbody>{saved.map((s) => (
              <tr key={s.id} className="border-b border-line/60">
                <td className="px-4 py-3 font-semibold">{s.name}</td><td className="px-3 py-3 text-muted">{s.type_name}</td>
                <td className="px-3 py-3">{Object.entries(s.params).map(([k, v]) => `${k}=${v}`).join(", ") || "–"}</td>
                <td className="px-3 py-3 text-muted">{dateTime(s.created_at)}</td>
                <td className="px-4 py-3 text-right"><Button variant="ghost" className="!px-2.5 !py-1.5 !text-xs !text-down" aria-label={`Delete saved strategy ${s.name}`} icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setToDelete(s)} /></td></tr>))}</tbody></table></div>)}
      </Panel>
      {toDelete && <Modal title={`Delete “${toDelete.name}”?`} onClose={() => setToDelete(null)}>
        <p className="mb-4 text-sm">Backtests that used this strategy are kept; they just lose the link to it.</p>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setToDelete(null)}>Cancel</Button><Button variant="danger" busy={busy} onClick={() => void del()}>Delete</Button></div></Modal>}
    </div>
  );
}
