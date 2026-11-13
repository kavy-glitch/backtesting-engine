import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CandleChart, DailyReturnsChart, EquityChart, TradePnlChart } from "../components/charts";
import { TradeTable } from "../components/backtest/TradeTable";
import { Providers } from "../App";
import { render } from "@testing-library/react";
import { candles, instruments, result, savedResult, strategies, summary, trades } from "./fixtures";
import { chartCalls, health, mockApi, renderApp } from "./mockApi";

const lists = {
  "GET /instruments": instruments, "GET /strategies": strategies, "GET /saved-strategies": [], "GET /health": health,
};
beforeEach(() => { vi.unstubAllGlobals(); chartCalls().length = 0; });

describe("Overview", () => {
  it("shows a loading skeleton, then the empty state when nothing is saved", async () => {
    mockApi({ ...lists, "GET /backtests?page=1&page_size=5&sort=created_at&order=desc": { items: [], total: 0, page: 1, page_size: 5 } });
    renderApp("/");
    expect(screen.getByLabelText("Loading overview")).toBeInTheDocument();
    expect(await screen.findByText("Run your first backtest")).toBeInTheDocument();
    expect(screen.getByTestId("stat-Instruments")).toHaveTextContent("2");
    expect(screen.getByTestId("stat-Daily candles stored")).toHaveTextContent("10");
  });

  it("shows the latest saved backtest with values taken from the API", async () => {
    mockApi({ ...lists,
      "GET /backtests?page=1&page_size=5&sort=created_at&order=desc": { items: [summary], total: 1, page: 1, page_size: 5 },
      "GET /backtests/7": savedResult });
    renderApp("/");
    expect(await screen.findByText(/Latest saved backtest: My run/)).toBeInTheDocument();
    expect(screen.getByTestId("stat-Final portfolio value")).toHaveTextContent("₹1,12,345");
    expect(screen.getByTestId("stat-Total return")).toHaveTextContent("+12.35%");
    expect(screen.getByTestId("stat-Win rate")).toHaveTextContent("50.0%");
    expect(screen.getByTestId("stat-Max drawdown")).toHaveTextContent("-4.20%");
  });

  it("shows an error state with a working retry", async () => {
    let fail = true;
    mockApi({ ...lists, "GET /backtests?page=1&page_size=5&sort=created_at&order=desc": () => fail ? { status: 503, body: { error: { code: "DATABASE_UNAVAILABLE", message: "The database is not reachable." } } } : { body: { items: [], total: 0, page: 1, page_size: 5 } } });
    renderApp("/");
    expect(await screen.findByText("The database is not reachable.")).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Run your first backtest")).toBeInTheDocument();
  });
});

describe("Backtest page", () => {
  it("validates inputs before running and disables the Run button", async () => {
    const calls = mockApi(lists);
    renderApp("/backtest");
    const capital = await screen.findByLabelText("Initial capital");
    await userEvent.clear(capital);
    await userEvent.type(capital, "-5");
    expect(screen.getByText("Enter an amount greater than 0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run backtest/ })).toBeDisabled();
    const fast = screen.getByLabelText("Fast period");
    await userEvent.clear(capital); await userEvent.type(capital, "100000");
    await userEvent.clear(fast); await userEvent.type(fast, "50");
    expect(screen.getByText("Fast period must be smaller than slow period")).toBeInTheDocument();
    expect(calls.some((c) => c.path.startsWith("/backtests/run"))).toBe(false);   // nothing was sent
  });

  it("runs a backtest and renders results that match the API response", async () => {
    const calls = mockApi({ ...lists, "POST /backtests/run": { body: result } });
    renderApp("/backtest");
    await userEvent.click(await screen.findByRole("button", { name: /Run backtest/ }));
    expect(await screen.findByTestId("stat-Final portfolio value")).toHaveTextContent("₹1,12,345");
    expect(screen.getByTestId("stat-Net profit / loss")).toHaveTextContent("₹12,345");
    expect(screen.getByTestId("stat-Total trades")).toHaveTextContent("3");           // 2 closed + 1 open
    expect(screen.getByTestId("stat-Sharpe ratio")).toHaveTextContent("1.23");
    expect(screen.getAllByText("SYNTHETIC").length).toBeGreaterThan(0);
    expect(screen.getByText(/Synthetic data\./)).toBeInTheDocument();
    // the request carried the form values
    const sent = calls.find((c) => c.path === "/backtests/run")!.body as Record<string, unknown>;
    expect(sent).toMatchObject({ instrument_id: 1, strategy_type: "sma_crossover", params: { fast: 10, slow: 30 }, initial_capital: 100000, fee_pct: 0.1, slippage_bps: 5 });
    // the candlestick chart received exactly the API's candles, in order, with OHLC intact
    const candleSeries = chartCalls().flatMap((c) => c.series).find((s) => s.kind === "candles")!;
    expect(candleSeries.data).toHaveLength(candles.length);
    expect(candleSeries.data[0]).toEqual({ time: "2024-01-01", open: 100, high: 103, low: 98, close: 101 });
    const volume = chartCalls().flatMap((c) => c.series).find((s) => s.kind === "histogram")!;
    expect((volume.data[1] as { value: number }).value).toBe(2000);
    const lines = chartCalls().flatMap((c) => c.series).filter((s) => s.kind === "line");
    expect(lines.length).toBeGreaterThanOrEqual(1);                                    // SMA overlay drawn
  });

  it("shows the loading skeleton while the engine runs", async () => {
    let release: (v: unknown) => void = () => {};
    mockApi({ ...lists, "POST /backtests/run": () => new Promise((res) => { release = () => res({ body: result }); }) });
    renderApp("/backtest");
    await userEvent.click(await screen.findByRole("button", { name: /Run backtest/ }));
    expect(await screen.findByLabelText("Running backtest")).toBeInTheDocument();
    release(null);
    expect(await screen.findByTestId("stat-Final portfolio value")).toBeInTheDocument();
  });

  it("shows server errors in the page and as a toast", async () => {
    mockApi({ ...lists, "POST /backtests/run": { status: 422, body: { error: { code: "INSUFFICIENT_DATA", message: "SMA Crossover needs at least 32 candles with these parameters, but only 10 were supplied", details: null } } } });
    renderApp("/backtest");
    await userEvent.click(await screen.findByRole("button", { name: /Run backtest/ }));
    expect(await screen.findByText(/Backtest failed\./)).toBeInTheDocument();
    expect(screen.getAllByText(/needs at least 32 candles/).length).toBeGreaterThanOrEqual(2);   // inline + toast
  });

  it("explains a network failure in plain words", async () => {
    mockApi(lists);
    renderApp("/backtest");
    const btn = await screen.findByRole("button", { name: /Run backtest/ });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await userEvent.click(btn);
    expect((await screen.findAllByText(/Cannot reach the server/)).length).toBeGreaterThan(0);
  });

  it("keeps Save disabled until a result exists, then saves via the API and offers exports", async () => {
    const calls = mockApi({ ...lists, "POST /backtests/run": { body: result }, "POST /backtests": { status: 201, body: savedResult } });
    renderApp("/backtest");
    const save = await screen.findByRole("button", { name: /^Save$/ });
    expect(save).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /Run backtest/ }));
    await screen.findByTestId("stat-Final portfolio value");
    expect(screen.queryByText("trades.csv")).not.toBeInTheDocument();
    await userEvent.click(save);
    expect(await screen.findByText(/Saved as backtest #7/)).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST" && c.path === "/backtests")).toHaveLength(1);
    const link = screen.getByRole("link", { name: /trades\.csv/ });
    expect(link).toHaveAttribute("href", "/api/v1/backtests/7/export/trades");
    expect(screen.getByRole("link", { name: /summary\.csv/ })).toHaveAttribute("href", "/api/v1/backtests/7/export/summary");
  });

  it("saves a strategy through the dialog", async () => {
    const calls = mockApi({ ...lists, "POST /saved-strategies": { status: 201, body: { id: 1, name: "Fast", strategy_type: "sma_crossover", type_name: "SMA Crossover", params: { fast: 10, slow: 30 }, created_at: "2026-01-01T00:00:00Z" } } });
    renderApp("/backtest");
    await userEvent.click(await screen.findByRole("button", { name: /Save this strategy for reuse/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save strategy" }));
    expect(await screen.findByText("Enter a name")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Name"), "Fast");
    await userEvent.click(screen.getByRole("button", { name: "Save strategy" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/saved-strategies")).toBe(true));
    expect(calls.find((c) => c.path === "/saved-strategies" && c.method === "POST")!.body).toEqual({ name: "Fast", strategy_type: "sma_crossover", params: { fast: 10, slow: 30 } });
  });

  it("tells the user to add market data when there are no instruments", async () => {
    mockApi({ ...lists, "GET /instruments": [] });
    renderApp("/backtest");
    expect(await screen.findByText("Add market data first")).toBeInTheDocument();
  });

  it("opens a saved backtest by id and shows a friendly message when it is missing", async () => {
    mockApi({ ...lists, "GET /backtests/7": savedResult, "GET /backtests/99": { status: 404, body: { error: { code: "NOT_FOUND", message: "Backtest not found" } } } });
    const { unmount } = renderApp("/backtest/7");
    expect(await screen.findByText("My run")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Use these settings in a new backtest/ })).toBeInTheDocument();
    unmount();
    renderApp("/backtest/99");
    expect(await screen.findByText(/does not exist/)).toBeInTheDocument();
  });
});

describe("charts with empty or minimal data", () => {
  const wrap = (ui: React.ReactElement) => render(<Providers>{ui}</Providers>);
  it("renders helpful empty states instead of crashing", () => {
    wrap(<CandleChart candles={[]} indicators={[]} trades={[]} currency="INR" />);
    expect(screen.getByText("No price data to chart")).toBeInTheDocument();
    wrap(<EquityChart equity={[]} currency="INR" />);
    expect(screen.getByText("No equity data")).toBeInTheDocument();
    wrap(<TradePnlChart trades={[]} />);
    expect(screen.getByText("No closed trades")).toBeInTheDocument();
    wrap(<DailyReturnsChart equity={result.equity.slice(0, 1)} />);
    expect(screen.getByText("Not enough data for daily returns")).toBeInTheDocument();
    expect(chartCalls().length).toBe(0);               // no chart object was even created
  });
  it("feeds the daily-returns chart real per-day returns", () => {
    wrap(<DailyReturnsChart equity={result.equity} />);
    const s = chartCalls()[0].series[0];
    expect(s.data).toHaveLength(9);
    expect((s.data[0] as { value: number }).value).toBeCloseTo((101000 / 100000 - 1) * 100, 10);
  });
  it("draws the trade P&L of closed trades only", () => {
    wrap(<TradePnlChart trades={trades} />);
    expect(chartCalls()[0].series[0].data).toHaveLength(2);
  });
  it("draws RSI and MACD panes when those indicators are present", () => {
    const ind = [{ name: "RSI 14", panel: "rsi" as const, points: [{ date: "2024-01-03", value: 55 }] },
      { name: "MACD", panel: "macd" as const, points: [{ date: "2024-01-03", value: 1 }] }, { name: "Histogram", panel: "macd" as const, points: [{ date: "2024-01-03", value: -1 }] }];
    wrap(<CandleChart candles={candles} indicators={ind} trades={trades} currency="INR" />);
    const kinds = chartCalls()[0].series.map((s) => s.kind);
    expect(kinds.filter((k) => k === "line").length).toBe(2);       // RSI + MACD
    expect(kinds.filter((k) => k === "histogram").length).toBe(2);   // volume + MACD histogram
  });
  it("changes the visible range with the date buttons without crashing", async () => {
    wrap(<CandleChart candles={candles} indicators={[]} trades={[]} currency="INR" />);
    for (const label of ["1M", "3M", "6M", "1Y", "All"]) await userEvent.click(screen.getByRole("button", { name: label }));
    expect(screen.getByTestId("chart-legend")).toHaveTextContent("12 Jan 2024");
  });
});

describe("trade table", () => {
  const many = Array.from({ length: 23 }, (_, i) => ({ ...trades[0], trade_no: i + 1, net_pnl: i % 2 ? -(i + 1) : i + 1, return_pct: i % 2 ? -1 : 1, exit_reason: (i % 5 === 0 ? "stop_loss" : "signal") as "stop_loss" | "signal" }));
  it("paginates", async () => {
    render(<TradeTable trades={many} currency="INR" />);
    expect(screen.getByTestId("page-indicator")).toHaveTextContent("Page 1 of 3");
    expect(screen.getByTestId("trade-count")).toHaveTextContent("23 of 23");
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByTestId("page-indicator")).toHaveTextContent("Page 2 of 3");
    expect(screen.getAllByRole("row")).toHaveLength(11);                        // header + 10
    await userEvent.selectOptions(screen.getByLabelText("Rows per page"), "50");
    expect(screen.getByTestId("page-indicator")).toHaveTextContent("Page 1 of 1");
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });
  it("filters by result and exit reason", async () => {
    render(<TradeTable trades={many} currency="INR" />);
    await userEvent.selectOptions(screen.getByLabelText("Filter by result"), "win");
    expect(screen.getByTestId("trade-count")).toHaveTextContent(`${many.filter((t) => t.net_pnl > 0).length} of 23`);
    await userEvent.selectOptions(screen.getByLabelText("Filter by exit reason"), "stop_loss");
    expect(screen.getByTestId("trade-count")).toHaveTextContent(`${many.filter((t) => t.net_pnl > 0 && t.exit_reason === "stop_loss").length} of 23`);
  });
  it("sorts by net P&L in both directions", async () => {
    render(<TradeTable trades={many} currency="INR" />);
    const pnlHeader = screen.getByRole("button", { name: /Net P&L/ });
    await userEvent.click(pnlHeader);               // first click: descending
    const firstRow = () => within(screen.getAllByRole("row")[1]).getAllByRole("cell")[0].textContent;
    expect(firstRow()).toBe("23");                  // trade 23 has the largest P&L (+23)
    await userEvent.click(pnlHeader);               // second click: ascending
    expect(firstRow()).toBe("22");                  // trade 22 has the most negative P&L (-22)
  });
  it("opens a detail dialog and closes it", async () => {
    render(<TradeTable trades={trades} currency="INR" />);
    await userEvent.click(screen.getByRole("button", { name: "Details for trade 1" }));
    const dialog = screen.getByRole("dialog", { name: "Trade 1 details" });
    expect(within(dialog).getByText("₹479.30")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close trade details" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("marks the open trade and shows an empty state with no trades", () => {
    const { unmount } = render(<TradeTable trades={trades} currency="INR" />);
    expect(screen.getByText(/OPEN/)).toBeInTheDocument();
    unmount();
    render(<TradeTable trades={[]} currency="INR" />);
    expect(screen.getByText("No trades")).toBeInTheDocument();
  });
});

describe("Market data page", () => {
  it("lists instruments, labels synthetic data, and shows an empty state", async () => {
    mockApi({ ...lists });
    const { unmount } = renderApp("/data");
    expect(await screen.findByText("SYNTH-TREND")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /SYNTH-TREND/ })).getByText("SYNTHETIC")).toBeInTheDocument();
    expect(screen.getByText("No data")).toBeInTheDocument();
    unmount();
    mockApi({ ...lists, "GET /instruments": [] });
    renderApp("/data");
    expect(await screen.findByText("No instruments yet")).toBeInTheDocument();
  });

  it("shows row-level validation errors when a CSV is rejected", async () => {
    mockApi({ ...lists, "POST /instruments/1/import-csv?mode=skip": { status: 422, body: { error: { code: "DATA_VALIDATION_FAILED", message: "2 problem(s) found; nothing was imported.", details: [{ row: 3, message: "invalid OHLC: high is below open/close/low" }, { row: 9, message: "duplicate date 2024-01-02 (first seen on row 4)" }] } } } });
    renderApp("/data");
    await userEvent.click(await screen.findByRole("button", { name: "Import CSV for SYNTH-TREND" }));
    const file = new File(["Date,Open,High,Low,Close,Volume\n"], "bad.csv", { type: "text/csv" });
    await userEvent.upload(screen.getByLabelText("CSV file"), file);
    await userEvent.click(screen.getByRole("button", { name: /Validate & import/ }));
    expect(await screen.findByText("2 problem(s) found; nothing was imported.")).toBeInTheDocument();
    expect(screen.getByText(/Row 3: invalid OHLC/)).toBeInTheDocument();
    expect(screen.getByText(/Row 9: duplicate date/)).toBeInTheDocument();
  });

  it("shows an import summary with warnings on success", async () => {
    mockApi({ ...lists, "POST /instruments/1/import-csv?mode=skip": { body: { rows_received: 5, rows_inserted: 4, rows_updated: 0, rows_skipped: 1, first_date: "2024-01-01", last_date: "2024-01-09", warnings: ["Gap of 30 days between 2024-01-01 and 2024-01-31 (possible missing candles)."] } } });
    renderApp("/data");
    await userEvent.click(await screen.findByRole("button", { name: "Import CSV for SYNTH-TREND" }));
    await userEvent.upload(screen.getByLabelText("CSV file"), new File(["x"], "ok.csv", { type: "text/csv" }));
    await userEvent.click(screen.getByRole("button", { name: /Validate & import/ }));
    const summaryBox = await screen.findByTestId("import-summary");
    expect(summaryBox).toHaveTextContent("4 inserted");
    expect(summaryBox).toHaveTextContent("possible missing candles");
  });

  it("validates the ticker field and sends the fetch request", async () => {
    const calls = mockApi({ ...lists, "POST /instruments/fetch-symbol": { status: 201, body: { instrument: instruments[1], rows_received: 3, rows_inserted: 3, rows_updated: 0, rows_skipped: 0, first_date: "2024-01-01", last_date: "2024-01-03", warnings: [] } } });
    renderApp("/data");
    await userEvent.click(await screen.findByRole("button", { name: /Fetch from Yahoo Finance/ }));
    const submit = screen.getByRole("button", { name: "Download" });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Ticker"), "bad ticker!");
    expect(screen.getByText("Ticker contains invalid characters")).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Ticker"));
    await userEvent.type(screen.getByLabelText("Ticker"), "RELIANCE.NS");
    await userEvent.click(submit);
    await waitFor(() => expect(calls.some((c) => c.path === "/instruments/fetch-symbol")).toBe(true));
    expect((calls.find((c) => c.path === "/instruments/fetch-symbol")!.body as { symbol: string }).symbol).toBe("RELIANCE.NS");
  });

  it("surfaces a provider failure inside the dialog", async () => {
    mockApi({ ...lists, "POST /instruments/fetch-symbol": { status: 502, body: { error: { code: "PROVIDER_ERROR", message: "No data returned for 'NOPE.NS'." } } } });
    renderApp("/data");
    await userEvent.click(await screen.findByRole("button", { name: /Fetch from Yahoo Finance/ }));
    await userEvent.type(screen.getByLabelText("Ticker"), "NOPE.NS");
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(await screen.findByText("No data returned for 'NOPE.NS'.")).toBeInTheDocument();
  });

  it("explains why an instrument with saved backtests cannot be deleted", async () => {
    mockApi({ ...lists, "DELETE /instruments/1": { status: 409, body: { error: { code: "IN_USE", message: "This instrument has saved backtests. Delete those first." } } } });
    renderApp("/data");
    await userEvent.click(await screen.findByRole("button", { name: "Delete SYNTH-TREND" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/has saved backtests/)).toBeInTheDocument();
  });
});

describe("History page", () => {
  const page = (items: unknown[], total = items.length) => ({ items, total, page: 1, page_size: 10 });
  it("lists saved backtests and requests filters/sort/pages from the server", async () => {
    const calls = mockApi({ ...lists, "GET /backtests?page=1&page_size=10&sort=created_at&order=desc": page([summary], 25),
      "GET /backtests?page=1&page_size=10&strategy_type=sma_crossover&sort=created_at&order=desc": page([summary], 1),
      "GET /backtests?page=2&page_size=10&sort=created_at&order=desc": page([], 25),
      "GET /backtests?page=1&page_size=10&sort=total_return_pct&order=desc": page([summary], 25) });
    renderApp("/history");
    expect(await screen.findByText("My run")).toBeInTheDocument();
    expect(screen.getByTestId("run-count")).toHaveTextContent("25 saved backtests");
    expect(screen.getByTestId("history-page")).toHaveTextContent("Page 1 of 3");
    await userEvent.selectOptions(screen.getByLabelText("Filter by strategy"), "sma_crossover");
    await waitFor(() => expect(calls.some((c) => c.path.includes("strategy_type=sma_crossover"))).toBe(true));
    await userEvent.selectOptions(screen.getByLabelText("Filter by strategy"), "");
    await userEvent.selectOptions(screen.getByLabelText("Sort by"), "total_return_pct");
    await waitFor(() => expect(calls.some((c) => c.path.includes("sort=total_return_pct"))).toBe(true));
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(calls.some((c) => c.path.includes("page=2"))).toBe(true));
  });
  it("shows an empty state, and asks for confirmation before deleting", async () => {
    mockApi({ ...lists, "GET /backtests?page=1&page_size=10&sort=created_at&order=desc": page([]) });
    const { unmount } = renderApp("/history");
    expect(await screen.findByText("No saved backtests yet")).toBeInTheDocument();
    unmount();
    const calls = mockApi({ ...lists, "GET /backtests?page=1&page_size=10&sort=created_at&order=desc": page([summary]), "DELETE /backtests/7": { status: 204 } });
    renderApp("/history");
    await userEvent.click(await screen.findByRole("button", { name: "Delete backtest 7" }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);               // not yet: needs confirmation
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path === "/backtests/7")).toBe(true));
  });
});

describe("Compare page", () => {
  it("runs a comparison, shows each strategy and surfaces a per-strategy failure", async () => {
    const calls = mockApi({ ...lists, "POST /backtests/compare": { body: {
      instrument: result.instrument, period: result.period, config: result.config, benchmark: result.equity.map((e) => ({ date: e.date, equity: e.benchmark_equity })),
      results: [
        { strategy: { type: "buy_and_hold", name: "Buy and Hold", params: {} }, error: null, metrics: result.metrics, equity: result.equity },
        { strategy: { type: "sma_crossover", params: {} }, error: { code: "INSUFFICIENT_DATA", message: "SMA Crossover needs at least 32 candles" } }] } } });
    renderApp("/compare");
    await userEvent.click(await screen.findByRole("button", { name: "Compare" }));
    expect(await screen.findByText("Buy and Hold", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByRole("alert", { name: "" , hidden: false })).toHaveTextContent("needs at least 32 candles");
    expect((calls.find((c) => c.path === "/backtests/compare")!.body as { strategies: unknown[] }).strategies).toHaveLength(2);   // only strategies that exist in the catalogue are sent
    expect(chartCalls().some((c) => c.series.filter((s) => s.kind === "line").length >= 2)).toBe(true);
  });
  it("blocks the request when no strategy is selected", async () => {
    mockApi(lists);
    renderApp("/compare");
    for (const name of ["Buy and Hold", "SMA Crossover"]) {
      const box = await screen.findByLabelText(name);
      if ((box as HTMLInputElement).checked) await userEvent.click(box);
    }
    expect(screen.getByText("Choose at least one strategy.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compare" })).toBeDisabled();
  });
});

describe("Strategies page and shell", () => {
  it("shows the catalogue and deletes a saved strategy after confirmation", async () => {
    const saved = [{ id: 3, name: "Fast SMA", strategy_type: "sma_crossover", type_name: "SMA Crossover", params: { fast: 5, slow: 15 }, created_at: "2026-01-01T00:00:00Z" }];
    const calls = mockApi({ ...lists, "GET /saved-strategies": saved, "DELETE /saved-strategies/3": { status: 204 } });
    renderApp("/strategies");
    expect(await screen.findByText("Fast period")).toBeInTheDocument();
    expect(screen.getByText("fast=5, slow=15")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete saved strategy Fast SMA" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path === "/saved-strategies/3")).toBe(true));
  });
  it("toggles the dark theme and shows API status", async () => {
    mockApi({ ...lists, "GET /backtests?page=1&page_size=5&sort=created_at&order=desc": { items: [], total: 0, page: 1, page_size: 5 } });
    renderApp("/");
    expect(await screen.findByText("All systems ready")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(document.documentElement).toHaveClass("dark");
    await userEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(document.documentElement).not.toHaveClass("dark");
  });
  it("reports an offline API in the status pill and has a 404 page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("down"); }));
    renderApp("/nope");
    expect(await screen.findByText("Page not found")).toBeInTheDocument();
    expect(await screen.findByText("API offline")).toBeInTheDocument();
  });
  it("navigates between pages with the sidebar", async () => {
    mockApi({ ...lists, "GET /backtests?page=1&page_size=5&sort=created_at&order=desc": { items: [], total: 0, page: 1, page_size: 5 }, "GET /backtests?page=1&page_size=10&sort=created_at&order=desc": { items: [], total: 0, page: 1, page_size: 10 } });
    renderApp("/");
    await userEvent.click(within(screen.getAllByRole("navigation", { name: "Main" })[0]).getByRole("link", { name: /History/ }));
    expect(await screen.findByRole("heading", { name: "History" })).toBeInTheDocument();
    fireEvent.click(within(screen.getAllByRole("navigation", { name: "Main" })[0]).getByRole("link", { name: /Market data/ }));
    expect(await screen.findByRole("heading", { name: "Market data" })).toBeInTheDocument();
  });
});
