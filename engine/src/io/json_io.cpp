#include "pbe/io/json_io.hpp"

#include <cmath>
#include <limits>

#include "pbe/execution/backtester.hpp"
#include "pbe/data/csv_loader.hpp"
#include "pbe/core/errors.hpp"

namespace pbe {
using json = nlohmann::json;

namespace {

json num(double v) { return std::isfinite(v) ? json(v) : json(nullptr); }
json num(const std::optional<double>& v) { return v ? num(*v) : json(nullptr); }

double readNumber(const json& j, const std::string& key, double def) {
  if (!j.contains(key) || j[key].is_null()) return def;
  if (!j[key].is_number()) throw ParseError("'" + key + "' must be a number");
  return j[key].get<double>();
}
std::optional<double> readOptional(const json& j, const std::string& key) {
  if (!j.contains(key) || j[key].is_null()) return std::nullopt;
  if (!j[key].is_number()) throw ParseError("'" + key + "' must be a number or null");
  return j[key].get<double>();
}
double candleNumber(const json& c, const char* key, std::size_t idx) {
  if (!c.contains(key)) throw ParseError("candle #" + std::to_string(idx) + " is missing '" + key + "'");
  if (c[key].is_null()) return std::numeric_limits<double>::quiet_NaN();
  if (!c[key].is_number()) throw ParseError("candle #" + std::to_string(idx) + ": '" + key + "' must be a number");
  return c[key].get<double>();
}

std::vector<Candle> readCandles(const json& req) {
  if (req.contains("candles_csv")) {
    if (!req["candles_csv"].is_string()) throw ParseError("'candles_csv' must be a file path string");
    return CsvCandleLoader::load(req["candles_csv"].get<std::string>());
  }
  if (!req.contains("candles") || !req["candles"].is_array())
    throw ParseError("request needs 'candles' (array) or 'candles_csv' (path)");
  std::vector<Candle> out;
  std::size_t i = 0;
  for (const json& c : req["candles"]) {
    if (!c.is_object() || !c.contains("date") || !c["date"].is_string())
      throw ParseError("candle #" + std::to_string(i) + " needs a string 'date'");
    Candle k;
    k.date = c["date"].get<std::string>();
    k.open = candleNumber(c, "open", i);
    k.high = candleNumber(c, "high", i);
    k.low = candleNumber(c, "low", i);
    k.close = candleNumber(c, "close", i);
    k.volume = candleNumber(c, "volume", i);
    out.push_back(k);
    ++i;
  }
  return out;
}

BacktestConfig readConfig(const json& req) {
  BacktestConfig cfg;
  const json c = req.contains("config") ? req["config"] : json::object();
  if (!c.is_object()) throw ParseError("'config' must be an object");
  if (req.contains("symbol") && req["symbol"].is_string()) cfg.symbol = req["symbol"].get<std::string>();
  cfg.initialCapital = readNumber(c, "initial_capital", 100000.0);
  cfg.costs.feePct = readNumber(c, "fee_pct", 0.0);
  cfg.costs.feeFlat = readNumber(c, "fee_flat", 0.0);
  cfg.costs.slippageBps = readNumber(c, "slippage_bps", 0.0);
  cfg.stopLossPct = readOptional(c, "stop_loss_pct");
  cfg.takeProfitPct = readOptional(c, "take_profit_pct");
  cfg.riskFreeRate = readNumber(c, "risk_free_rate", 0.0);
  if (c.contains("allow_fractional")) {
    if (!c["allow_fractional"].is_boolean()) throw ParseError("'allow_fractional' must be true/false");
    cfg.allowFractional = c["allow_fractional"].get<bool>();
  }
  if (c.contains("position_sizing")) {
    const json& s = c["position_sizing"];
    if (!s.is_object() || !s.contains("mode")) throw ParseError("'position_sizing' needs a 'mode'");
    const std::string mode = s["mode"].is_string() ? s["mode"].get<std::string>() : "";
    if (mode == "percent_equity") cfg.sizingMode = SizingMode::PercentEquity;
    else if (mode == "fixed_quantity") cfg.sizingMode = SizingMode::FixedQuantity;
    else throw ParseError("position_sizing.mode must be 'percent_equity' or 'fixed_quantity'");
    cfg.sizingValue = readNumber(s, "value", 100.0);
  }
  return cfg;
}

json tradeJson(const Trade& t) {
  return {{"id", t.id}, {"symbol", t.symbol}, {"direction", t.direction}, {"status", t.status},
          {"entry_date", t.entryDate}, {"exit_date", t.exitDate},
          {"entry_index", t.entryIndex}, {"exit_index", t.exitIndex},
          {"entry_price", t.entryPrice}, {"exit_price", t.exitPrice}, {"quantity", t.quantity},
          {"entry_fee", t.entryFee}, {"exit_fee", t.exitFee},
          {"gross_pnl", t.grossPnl}, {"net_pnl", t.netPnl}, {"return_pct", t.returnPct},
          {"holding_days", t.holdingDays}, {"exit_reason", t.exitReason}};
}

json equityJson(const std::vector<EquityPoint>& v) {
  json a = json::array();
  for (const auto& p : v)
    a.push_back({{"date", p.date}, {"equity", p.equity}, {"cash", p.cash},
                 {"position_value", p.positionValue}, {"drawdown_pct", p.drawdownPct}});
  return a;
}

json metricsJson(const Metrics& m) {
  json notes = json::object();
  for (const auto& kv : m.notes) notes[kv.first] = kv.second;
  return {{"initial_capital", m.initialCapital}, {"final_equity", m.finalEquity},
          {"net_profit", m.netProfit}, {"total_return_pct", m.totalReturnPct},
          {"realized_pnl", m.realizedPnl}, {"unrealized_pnl", m.unrealizedPnl},
          {"total_fees", m.totalFees}, {"max_drawdown_pct", m.maxDrawdownPct},
          {"exposure_pct", m.exposurePct}, {"closed_trades", m.closedTrades},
          {"winning_trades", m.winningTrades}, {"losing_trades", m.losingTrades},
          {"breakeven_trades", m.breakevenTrades}, {"win_rate_pct", num(m.winRatePct)},
          {"avg_trade_return_pct", num(m.avgTradeReturnPct)}, {"avg_win", num(m.avgWin)},
          {"avg_loss", num(m.avgLoss)}, {"profit_factor", num(m.profitFactor)},
          {"sharpe_ratio", num(m.sharpe)}, {"sortino_ratio", num(m.sortino)},
          {"annual_volatility_pct", num(m.annualVolatilityPct)}, {"cagr_pct", num(m.cagrPct)},
          {"buy_hold_return_pct", m.buyHoldReturnPct}, {"buy_hold_final_equity", m.buyHoldFinalEquity},
          {"notes", notes}};
}

}  // namespace

json strategyCatalogJson() {
  json out = json::array();
  for (const StrategyInfo& s : StrategyFactory::catalog()) {
    json params = json::array();
    for (const ParamSpec& p : s.params)
      params.push_back({{"key", p.key}, {"label", p.label}, {"default", p.def},
                        {"min", p.min}, {"max", p.max}, {"integer", p.integer}});
    out.push_back({{"type", s.type}, {"name", s.name}, {"description", s.description}, {"params", params}});
  }
  return out;
}

json handleRequest(const json& req) {
  try {
    if (!req.is_object()) throw ParseError("request must be a JSON object");
    if (!req.contains("strategy") || !req["strategy"].is_object() || !req["strategy"].contains("type") ||
        !req["strategy"]["type"].is_string())
      throw ParseError("request needs strategy.type");
    ParamMap params;
    if (req["strategy"].contains("params")) {
      const json& p = req["strategy"]["params"];
      if (!p.is_object()) throw ParseError("strategy.params must be an object");
      for (auto it = p.begin(); it != p.end(); ++it) {
        if (!it.value().is_number()) throw ParseError("strategy param '" + it.key() + "' must be a number");
        params[it.key()] = it.value().get<double>();
      }
    }
    auto strategy = StrategyFactory::create(req["strategy"]["type"].get<std::string>(), params);
    const BacktestConfig cfg = readConfig(req);
    if (req.contains("validate_only") && req["validate_only"].is_boolean() && req["validate_only"].get<bool>()) {
      cfg.validate();  // dry run: parameters and configuration only, no candles needed
      return {{"ok", true}, {"engine_version", kEngineVersion}, {"result", {{"valid", true}}}};
    }
    const CandleSeries candles(readCandles(req));
    const BacktestResult r = Backtester(cfg).run(candles, *strategy);

    json trades = json::array();
    for (const Trade& t : r.trades) trades.push_back(tradeJson(t));
    json bench = json::array();
    for (const auto& p : r.benchmark)
      bench.push_back({{"date", p.date}, {"equity", p.equity}, {"drawdown_pct", p.drawdownPct}});
    json inds = json::array();
    for (const auto& s : r.indicators) {
      json vals = json::array();
      for (double v : s.values) vals.push_back(num(v));
      inds.push_back({{"name", s.name}, {"panel", s.panel}, {"values", vals}});
    }
    json rej = json::array();
    for (const auto& o : r.rejected) rej.push_back({{"date", o.date}, {"side", o.side}, {"reason", o.reason}});
    json params_out = json::object();
    for (const auto& kv : strategy->params()) params_out[kv.first] = kv.second;

    return {{"ok", true}, {"engine_version", kEngineVersion},
            {"result", {{"strategy", {{"type", strategy->type()}, {"name", strategy->displayName()}, {"params", params_out}}},
                        {"metrics", metricsJson(r.metrics)}, {"trades", trades},
                        {"open_trade", r.openTrade ? tradeJson(*r.openTrade) : json(nullptr)},
                        {"equity", equityJson(r.equity)}, {"benchmark", bench}, {"indicators", inds},
                        {"rejected_orders", rej}, {"warnings", r.warnings}}}};
  } catch (const EngineError& e) {
    return {{"ok", false}, {"error", {{"code", e.code()}, {"message", e.what()}}}};
  } catch (const json::exception& e) {
    return {{"ok", false}, {"error", {{"code", "PARSE_ERROR"}, {"message", e.what()}}}};
  } catch (const std::exception& e) {
    return {{"ok", false}, {"error", {{"code", "INTERNAL"}, {"message", "unexpected engine failure"}}}};
  }
}

}  // namespace pbe
