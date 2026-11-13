import { describe, expect, it } from "vitest";
import * as f from "../lib/format";
import { validateConfig, hasErrors, type ConfigForm } from "../lib/validation";
import { defaultForm, toRequest, formFromResult } from "../lib/request";
import { instruments, result, strategies } from "./fixtures";

describe("formatting", () => {
  it("formats rupees with Indian digit grouping", () => {
    expect(f.money(1234567.5, "INR", 2)).toBe("₹12,34,567.50");
    expect(f.money(112345, "INR", 0)).toBe("₹1,12,345");
    expect(f.money(-250, "USD", 0)).toContain("250");
  });
  it("never prints NaN, Infinity or undefined", () => {
    for (const bad of [NaN, Infinity, -Infinity, null, undefined]) {
      expect(f.money(bad as number)).toBe("–");
      expect(f.pct(bad as number)).toBe("–");
      expect(f.ratio(bad as number)).toBe("–");
      expect(f.price(bad as number)).toBe("–");
    }
  });
  it("formats percentages with optional sign", () => {
    expect(f.pct(12.345, 2, true)).toBe("+12.35%");
    expect(f.pct(-3, 1, true)).toBe("-3.0%");
    expect(f.pct(0, 2, true)).toBe("0.00%");
  });
  it("formats ISO dates without time-zone shifts", () => {
    expect(f.date("2024-01-05")).toBe("05 Jan 2024");
    expect(f.date("2024-12-31")).toBe("31 Dec 2024");
    expect(f.date(null)).toBe("–");
  });
  it("classifies profit and loss tone", () => {
    expect([f.tone(1), f.tone(-1), f.tone(0), f.tone(null)]).toEqual(["up", "down", "flat", "flat"]);
  });
});

const base = (): ConfigForm => defaultForm(instruments, strategies);
const specs = strategies[1].params;

describe("form validation", () => {
  it("accepts the defaults", () => {
    expect(hasErrors(validateConfig(base(), specs))).toBe(false);
  });
  it("rejects bad money and cost values", () => {
    const e = validateConfig({ ...base(), capital: "0", feePct: "100", slippageBps: "-1", sizingValue: "150", riskFree: "abc" }, specs);
    expect(e.capital).toBeTruthy(); expect(e.feePct).toBeTruthy(); expect(e.slippageBps).toBeTruthy();
    expect(e.sizingValue).toBeTruthy(); expect(e.riskFree).toBeTruthy();
  });
  it("accepts empty stop-loss but rejects out-of-range ones", () => {
    expect(validateConfig({ ...base(), stopLoss: "" }, specs).stopLoss).toBeUndefined();
    expect(validateConfig({ ...base(), stopLoss: "0" }, specs).stopLoss).toBeTruthy();
    expect(validateConfig({ ...base(), stopLoss: "100" }, specs).stopLoss).toBeTruthy();
    expect(validateConfig({ ...base(), takeProfit: "-5" }, specs).takeProfit).toBeTruthy();
  });
  it("validates strategy parameters (range, integer, fast < slow)", () => {
    expect(validateConfig({ ...base(), params: { fast: "30", slow: "10" } }, specs)["param.fast"]).toMatch(/smaller/);
    expect(validateConfig({ ...base(), params: { fast: "2.5", slow: "10" } }, specs)["param.fast"]).toMatch(/Whole/);
    expect(validateConfig({ ...base(), params: { fast: "0", slow: "10" } }, specs)["param.fast"]).toMatch(/between/);
    expect(validateConfig({ ...base(), params: { fast: "", slow: "10" } }, specs)["param.fast"]).toBeTruthy();
  });
  it("validates the date range", () => {
    expect(validateConfig({ ...base(), start: "2024-02-01", end: "2024-01-01" }, specs).end).toBeTruthy();
    expect(validateConfig({ ...base(), end: "2023-06-01" }, specs, { first: "2024-01-01", last: "2024-12-31" }).end).toMatch(/No data before/);
  });
  it("requires an instrument", () => {
    expect(validateConfig({ ...base(), instrumentId: "" }, specs).instrumentId).toBeTruthy();
  });
});

describe("request building", () => {
  it("converts the form into the API request (percent -> fraction, blanks -> null)", () => {
    const req = toRequest({ ...base(), riskFree: "6", stopLoss: "", takeProfit: "20", name: " Hello " });
    expect(req.risk_free_rate).toBeCloseTo(0.06);
    expect(req.stop_loss_pct).toBeNull();
    expect(req.take_profit_pct).toBe(20);
    expect(req.name).toBe("Hello");
    expect(req.params).toEqual({ fast: 10, slow: 30 });
    expect(req.start_date).toBeNull();
  });
  it("round-trips a result back into form fields", () => {
    const form = formFromResult(result);
    expect(form.strategy).toBe("sma_crossover");
    expect(form.capital).toBe("100000");
    expect(toRequest(form).fee_pct).toBe(0.1);
  });
});
