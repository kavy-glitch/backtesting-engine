import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { AppRoutes, Providers } from "../App";

export interface Call { method: string; path: string; body: unknown }
type Handler = (call: Call) => { status?: number; body?: unknown } | Promise<{ status?: number; body?: unknown }>;

/** Stubs fetch with an in-memory router. Keys look like "GET /instruments" (the /api/v1 prefix is dropped). */
export function mockApi(routes: Record<string, Handler | unknown>) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    const full = String(url).replace(/^\/api\/v1/, "");
    const path = full.split("?")[0];
    let body: unknown = init.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { /* keep */ } }
    const call = { method, path: full, body };
    calls.push(call);
    const key = Object.keys(routes).find((k) => k === `${method} ${full}`) ?? Object.keys(routes).find((k) => k === `${method} ${path}`);
    if (!key) return new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: `no mock for ${method} ${full}` } }), { status: 404 });
    const h = routes[key];
    const isOutput = (v: unknown): v is { status?: number; body?: unknown } => typeof v === "object" && v !== null && !Array.isArray(v) && ("body" in v || typeof (v as { status?: unknown }).status === "number");
    const out = typeof h === "function" ? await (h as Handler)(call) : isOutput(h) ? h : { body: h };
    const status = out.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(out.body ?? null), { status, headers: { "Content-Type": "application/json" } });
  }));
  return calls;
}

export const health = { status: "ok", database: "ok", engine: "ok", engine_version: "1.0.0" };

export function renderApp(path = "/", state?: unknown) {
  return render(<Providers><MemoryRouter initialEntries={[{ pathname: path, state }]}><AppRoutes /></MemoryRouter></Providers>);
}

export const chartCalls = () => (globalThis as unknown as { __chartCalls: { series: { kind: string; data: unknown[] }[] }[] }).__chartCalls;
