// Charts built on TradingView Lightweight Charts (Apache-2.0; the TradingView attribution logo is kept
// visible, as the licence requires). Every chart is drawn from real API data only.
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  AreaSeries, CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart, createSeriesMarkers,
  type IChartApi, type SeriesMarker, type Time,
} from "lightweight-charts";
import type { Candle, EquityPoint, IndicatorSeries, Trade } from "../../api/types";
import { date as fmtDate, money, pct, price as fmtPrice, qty as fmtQty } from "../../lib/format";
import { useTheme } from "../../lib/hooks";
import { Button, EmptyState, cx } from "../ui";
import { BarChart3 } from "lucide-react";

const T = (d: string) => d as unknown as Time;

interface Palette { up: string; down: string; text: string; muted: string; line: string; surface: string; accent: string; primary: string }
function palette(): Palette {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string, fb: string) => s.getPropertyValue(n).trim() || fb;
  return { up: v("--up", "#00a37a"), down: v("--down", "#e5484d"), text: v("--text", "#1b2430"), muted: v("--muted", "#6b7686"),
    line: v("--border", "#e6e9ee"), surface: v("--surface", "#fff"), accent: v("--accent", "#5367ff"), primary: v("--primary", "#00a37a") };
}
function baseOptions(p: Palette) {
  return {
    autoSize: true,
    layout: { background: { type: ColorType.Solid, color: p.surface }, textColor: p.muted, attributionLogo: true, fontFamily: "Inter, system-ui, sans-serif" },
    grid: { vertLines: { color: p.line }, horzLines: { color: p.line } },
    rightPriceScale: { borderColor: p.line },
    timeScale: { borderColor: p.line, rightOffset: 4 },
    crosshair: { mode: CrosshairMode.Normal },
  };
}

function useLwChart(build: (chart: IChartApi, p: Palette) => void, deps: unknown[]): { ref: RefObject<HTMLDivElement | null>; chart: RefObject<IChartApi | null> } {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const { theme } = useTheme();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = createChart(el, baseOptions(palette()));
    chartRef.current = chart;
    build(chart, palette());
    return () => { chartRef.current = null; chart.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, ...deps]);
  return { ref, chart: chartRef };
}

const RANGES = [["1M", 30], ["3M", 91], ["6M", 182], ["1Y", 365], ["All", 0]] as const;
function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// ============================================================ candlesticks
export function CandleChart({ candles, indicators, trades, currency }: { candles: Candle[]; indicators: IndicatorSeries[]; trades: Trade[]; currency: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const byDate = useMemo(() => new Map(candles.map((c, i) => [c.date, { c, prev: candles[i - 1] }])), [candles]);
  const tradeMarks = useMemo(() => {
    const m = new Map<string, string[]>();
    const add = (d: string, text: string) => m.set(d, [...(m.get(d) ?? []), text]);
    for (const t of trades) {
      add(t.entry_date, `BUY ${fmtQty(t.quantity)} @ ${fmtPrice(t.entry_price)}`);
      if (t.status === "closed")
        add(t.exit_date, `SELL ${fmtQty(t.quantity)} @ ${fmtPrice(t.exit_price)} (${t.exit_reason.replace("_", " ")}) · net ${money(t.net_pnl, currency)} · ${pct(t.return_pct, 2, true)}`);
    }
    return m;
  }, [trades, currency]);
  const overlays = indicators.filter((i) => i.panel === "overlay");
  const rsi = indicators.filter((i) => i.panel === "rsi");
  const macd = indicators.filter((i) => i.panel === "macd");
  const extraPanes = (rsi.length ? 1 : 0) + (macd.length ? 1 : 0);
  const height = 400 + extraPanes * 150;

  const { ref, chart } = useLwChart((c, p) => {
    if (!candles.length) return;
    const main = c.addSeries(CandlestickSeries, { upColor: p.up, downColor: p.down, wickUpColor: p.up, wickDownColor: p.down, borderVisible: false }, 0);
    main.setData(candles.map((k) => ({ time: T(k.date), open: k.open, high: k.high, low: k.low, close: k.close })));
    const vol = c.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "", lastValueVisible: false, priceLineVisible: false }, 0);
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vol.setData(candles.map((k) => ({ time: T(k.date), value: k.volume, color: (k.close >= k.open ? p.up : p.down) + "55" })));

    const colors = [p.accent, "#f59e0b", "#a855f7", "#14b8a6"];
    overlays.forEach((s, i) => {
      const l = c.addSeries(LineSeries, { color: colors[i % colors.length], lineWidth: 2, title: s.name, priceLineVisible: false, lastValueVisible: false }, 0);
      l.setData(s.points.map((q) => ({ time: T(q.date), value: q.value })));
    });
    let pane = 1;
    if (rsi.length) {
      rsi.forEach((s) => {
        const l = c.addSeries(LineSeries, { color: p.accent, lineWidth: 2, title: s.name, priceLineVisible: false }, pane);
        l.setData(s.points.map((q) => ({ time: T(q.date), value: q.value })));
        l.createPriceLine({ price: 70, color: p.down, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: "" });
        l.createPriceLine({ price: 30, color: p.up, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: "" });
      });
      c.panes()[pane]?.setHeight(140);
      pane++;
    }
    if (macd.length) {
      for (const s of macd) {
        const pts = s.points.map((q) => ({ time: T(q.date), value: q.value }));
        if (s.name === "Histogram") {
          const h = c.addSeries(HistogramSeries, { title: "Hist", priceLineVisible: false, lastValueVisible: false }, pane);
          h.setData(pts.map((q) => ({ ...q, color: (q.value >= 0 ? p.up : p.down) + "99" })));
        } else {
          const l = c.addSeries(LineSeries, { color: s.name === "MACD" ? p.accent : "#f59e0b", lineWidth: 2, title: s.name, priceLineVisible: false, lastValueVisible: false }, pane);
          l.setData(pts);
        }
      }
      c.panes()[pane]?.setHeight(140);
    }

    const markers: SeriesMarker<Time>[] = [];
    for (const t of trades) {
      markers.push({ time: T(t.entry_date), position: "belowBar", color: p.up, shape: "arrowUp", text: "BUY" });
      if (t.status === "closed")
        markers.push({ time: T(t.exit_date), position: "aboveBar", color: t.net_pnl >= 0 ? p.up : p.down, shape: "arrowDown", text: t.exit_reason === "signal" ? "SELL" : t.exit_reason === "stop_loss" ? "SL" : "TP" });
    }
    markers.sort((a, b) => String(a.time).localeCompare(String(b.time)));
    createSeriesMarkers(main, markers);
    c.timeScale().fitContent();
    c.subscribeCrosshairMove((param) => setHover(param.time ? String(param.time) : null));
  }, [candles, indicators, trades]);

  if (!candles.length) return <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="No price data to chart" text="This instrument has no candles in the selected period." />;

  const last = candles[candles.length - 1];
  const shown = byDate.get(hover ?? "") ?? { c: last, prev: candles[candles.length - 2] };
  const chg = shown.prev ? (shown.c.close / shown.prev.close - 1) * 100 : null;
  const events = hover ? tradeMarks.get(hover) : undefined;

  const setRange = (days: number) => {
    const ts = chart.current?.timeScale();
    if (!ts) return;
    if (days === 0) ts.fitContent();
    else ts.setVisibleRange({ from: T(shiftDate(last.date, days)), to: T(last.date) });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2 pt-3">
        <div className="num flex min-h-[1.5rem] flex-wrap items-center gap-x-3 gap-y-1 text-xs" aria-live="off" data-testid="chart-legend">
          <span className="font-semibold">{fmtDate(shown.c.date)}</span>
          <span>O <b>{fmtPrice(shown.c.open)}</b></span><span>H <b>{fmtPrice(shown.c.high)}</b></span>
          <span>L <b>{fmtPrice(shown.c.low)}</b></span><span>C <b>{fmtPrice(shown.c.close)}</b></span>
          {chg !== null && <span className={chg >= 0 ? "text-up" : "text-down"}>{pct(chg, 2, true)}</span>}
          <span className="text-muted">Vol <b>{shown.c.volume.toLocaleString("en-IN")}</b></span>
        </div>
        <div className="flex gap-1" role="group" aria-label="Date range">
          {RANGES.map(([label, days]) => <Button key={label} variant="ghost" className="!px-2.5 !py-1 !text-xs" onClick={() => setRange(days)}>{label}</Button>)}
        </div>
      </div>
      {events && <div className="mx-4 mb-2 rounded-lg bg-surface-2 px-3 py-2 text-xs" data-testid="trade-tooltip">{events.map((e, i) => <div key={i}>{e}</div>)}</div>}
      <div ref={ref} style={{ height }} data-testid="candle-chart" />
    </div>
  );
}

// ============================================================ equity + drawdown
export function EquityChart({ equity, currency }: { equity: EquityPoint[]; currency: string }) {
  const { ref } = useLwChart((c, p) => {
    if (!equity.length) return;
    const s = c.addSeries(LineSeries, { color: p.primary, lineWidth: 2, title: "Strategy", priceFormat: { type: "price", precision: 0, minMove: 1 } }, 0);
    s.setData(equity.map((e) => ({ time: T(e.date), value: e.equity })));
    const b = c.addSeries(LineSeries, { color: p.muted, lineWidth: 2, lineStyle: LineStyle.Dashed, title: "Buy & hold", priceFormat: { type: "price", precision: 0, minMove: 1 } }, 0);
    b.setData(equity.map((e) => ({ time: T(e.date), value: e.benchmark_equity })));
    const dd = c.addSeries(AreaSeries, { lineColor: p.down, topColor: p.down + "11", bottomColor: p.down + "55", lineWidth: 2, title: "Drawdown %", priceFormat: { type: "price", precision: 2, minMove: 0.01 } }, 1);
    dd.setData(equity.map((e) => ({ time: T(e.date), value: e.drawdown_pct })));
    c.panes()[1]?.setHeight(150);
    c.timeScale().fitContent();
  }, [equity]);
  if (!equity.length) return <EmptyState title="No equity data" />;
  const last = equity[equity.length - 1];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 px-4 py-3 text-xs">
        <Legend color="var(--primary)" label={`Strategy ${money(last.equity, currency, 0)}`} />
        <Legend color="var(--muted)" dashed label={`Buy & hold ${money(last.benchmark_equity, currency, 0)}`} />
        <Legend color="var(--down)" label="Drawdown (lower pane)" />
      </div>
      <div ref={ref} style={{ height: 470 }} data-testid="equity-chart" />
    </div>
  );
}

export function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx("inline-block h-0 w-5 border-t-2", dashed && "border-dashed")} style={{ borderColor: color }} aria-hidden />
      <span className="num">{label}</span>
    </span>
  );
}

// ============================================================ daily returns + trade P&L
export function DailyReturnsChart({ equity }: { equity: EquityPoint[] }) {
  const data = useMemo(() => equity.slice(1).map((e, i) => ({ date: e.date, r: equity[i].equity > 0 ? (e.equity / equity[i].equity - 1) * 100 : 0 })), [equity]);
  const { ref } = useLwChart((c, p) => {
    if (!data.length) return;
    const h = c.addSeries(HistogramSeries, { priceFormat: { type: "price", precision: 2, minMove: 0.01 }, title: "Daily %" });
    h.setData(data.map((d) => ({ time: T(d.date), value: d.r, color: d.r >= 0 ? p.up : p.down })));
    c.timeScale().fitContent();
  }, [data]);
  if (!data.length) return <EmptyState title="Not enough data for daily returns" />;
  return <div ref={ref} style={{ height: 220 }} data-testid="returns-chart" />;
}

export function TradePnlChart({ trades }: { trades: Trade[] }) {
  const closed = trades.filter((t) => t.status === "closed");
  const { ref } = useLwChart((c, p) => {
    if (!closed.length) return;
    const h = c.addSeries(HistogramSeries, { priceFormat: { type: "price", precision: 0, minMove: 1 }, title: "Net P&L" });
    h.setData(closed.map((t) => ({ time: T(t.exit_date), value: t.net_pnl, color: t.net_pnl >= 0 ? p.up : p.down })));
    c.timeScale().fitContent();
  }, [trades]);
  if (!closed.length) return <EmptyState title="No closed trades" text="This run closed no trades, so there is no trade P&L to chart." />;
  return <div ref={ref} style={{ height: 220 }} data-testid="trade-pnl-chart" />;
}

// ============================================================ strategy comparison
export const COMPARE_COLORS = ["#5367ff", "#f59e0b", "#a855f7", "#14b8a6", "#ef4444", "#0ea5e9"];
export function CompareChart({ benchmark, results }: { benchmark: { date: string; equity: number }[]; results: { label: string; equity: { date: string; equity: number }[] }[] }) {
  const { ref } = useLwChart((c, p) => {
    if (!benchmark.length) return;
    const b = c.addSeries(LineSeries, { color: p.muted, lineStyle: LineStyle.Dashed, lineWidth: 2, title: "Buy & hold", priceLineVisible: false }, 0);
    b.setData(benchmark.map((e) => ({ time: T(e.date), value: e.equity })));
    results.forEach((r, i) => {
      const s = c.addSeries(LineSeries, { color: COMPARE_COLORS[i % COMPARE_COLORS.length], lineWidth: 2, title: r.label, priceLineVisible: false }, 0);
      s.setData(r.equity.map((e) => ({ time: T(e.date), value: e.equity })));
    });
    c.timeScale().fitContent();
  }, [benchmark, results]);
  if (!benchmark.length && !results.length) return <EmptyState title="Nothing to compare yet" />;
  return <div ref={ref} style={{ height: 380 }} data-testid="compare-chart" />;
}
