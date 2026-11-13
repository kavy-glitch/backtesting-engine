import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

// jsdom has no canvas, so the charting library is replaced by a recorder that lets tests check
// what data each chart was given.
type Rec = { series: { kind: string; data: unknown[] }[] };
vi.mock("lightweight-charts", () => {
  const calls: Rec[] = [];
  (globalThis as unknown as { __chartCalls: Rec[] }).__chartCalls = calls;
  const makeSeries = (kind: string, rec: Rec) => {
    const entry = { kind, data: [] as unknown[] };
    rec.series.push(entry);
    return { setData: (d: unknown[]) => { entry.data = d; }, applyOptions: () => {}, createPriceLine: () => ({}), priceScale: () => ({ applyOptions: () => {} }) };
  };
  return {
    createChart: () => {
      const rec: Rec = { series: [] };
      calls.push(rec);
      return {
        addSeries: (def: { kind: string }) => makeSeries(def.kind, rec),
        removeSeries: () => {}, applyOptions: () => {}, remove: () => {},
        timeScale: () => ({ fitContent: () => {}, setVisibleRange: () => {}, applyOptions: () => {} }),
        panes: () => [{ setHeight: () => {} }, { setHeight: () => {} }, { setHeight: () => {} }],
        subscribeCrosshairMove: () => {}, unsubscribeCrosshairMove: () => {}, resize: () => {},
      };
    },
    createSeriesMarkers: () => ({ setMarkers: () => {}, detach: () => {} }),
    CandlestickSeries: { kind: "candles" }, LineSeries: { kind: "line" }, HistogramSeries: { kind: "histogram" }, AreaSeries: { kind: "area" },
    ColorType: { Solid: "solid" }, CrosshairMode: { Normal: 0 }, LineStyle: { Dashed: 2, Solid: 0 },
  };
});

// ResizeObserver / matchMedia are missing in jsdom
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
}
