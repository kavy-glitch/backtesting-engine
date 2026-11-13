import type {
  BacktestResult, CompareResult, HealthStatus, ImportSummary, Instrument, Paged, RunRequest, RunSummary,
  SavedStrategy, StrategyType, Candle,
} from "./types";

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api/v1";

export interface FieldIssue { field: string; message: string }
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json", ...init.headers } : init.headers,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Cannot reach the server. Check that the backend is running.");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const err = (body as { error?: { code: string; message: string; details?: unknown } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? "HTTP_ERROR", err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return body as T;
}

const qs = (o: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") p.set(k, String(v)); });
  const s = p.toString();
  return s ? `?${s}` : "";
};
const post = <T,>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  health: () => request<HealthStatus>("/health"),
  instruments: () => request<Instrument[]>("/instruments"),
  createInstrument: (b: { symbol: string; name?: string; currency?: string; asset_class?: string }) => post<Instrument>("/instruments", b),
  deleteInstrument: (id: number) => request<void>(`/instruments/${id}`, { method: "DELETE" }),
  candles: (id: number, start?: string, end?: string) => request<Candle[]>(`/instruments/${id}/candles${qs({ start, end })}`),
  importCsv: (id: number, file: File, mode: "skip" | "replace") => {
    const fd = new FormData();
    fd.append("file", file);
    return request<ImportSummary>(`/instruments/${id}/import-csv${qs({ mode })}`, { method: "POST", body: fd });
  },
  fetchForInstrument: (id: number, start_date: string, end_date: string) => post<ImportSummary>(`/instruments/${id}/fetch`, { start_date, end_date }),
  fetchSymbol: (b: { symbol: string; name?: string; currency?: string; asset_class?: string; start_date: string; end_date: string }) =>
    post<ImportSummary & { instrument: Instrument }>("/instruments/fetch-symbol", b),
  strategies: () => request<StrategyType[]>("/strategies"),
  savedStrategies: () => request<SavedStrategy[]>("/saved-strategies"),
  createSavedStrategy: (b: { name: string; strategy_type: string; params: Record<string, number> }) => post<SavedStrategy>("/saved-strategies", b),
  deleteSavedStrategy: (id: number) => request<void>(`/saved-strategies/${id}`, { method: "DELETE" }),
  runBacktest: (b: RunRequest) => post<BacktestResult>("/backtests/run", b),
  saveBacktest: (b: RunRequest) => post<BacktestResult>("/backtests", b),
  compare: (b: Omit<RunRequest, "strategy_type" | "params" | "name" | "saved_strategy_id"> & { strategies: { strategy_type: string; params: Record<string, number> }[] }) =>
    post<CompareResult>("/backtests/compare", b),
  runs: (q: { page: number; page_size: number; instrument_id?: number; strategy_type?: string; sort: string; order: string }) =>
    request<Paged<RunSummary>>(`/backtests${qs(q)}`),
  run: (id: number) => request<BacktestResult>(`/backtests/${id}`),
  deleteRun: (id: number) => request<void>(`/backtests/${id}`, { method: "DELETE" }),
  exportUrl: (id: number, kind: "trades" | "equity" | "metrics" | "summary") => `${BASE}/backtests/${id}/export/${kind}`,
};
