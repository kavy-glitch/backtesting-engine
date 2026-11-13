#include "pbe/strategy/strategy.hpp"

#include <cmath>
#include <sstream>

#include "pbe/core/errors.hpp"
#include "pbe/strategy/indicators.hpp"

namespace pbe {

int Strategy::created_ = 0;

namespace {
void requireInt(const char* name, int v, int lo, int hi) {
  if (v < lo || v > hi) {
    std::ostringstream os;
    os << "parameter '" << name << "' must be between " << lo << " and " << hi << " (got " << v << ")";
    throw InvalidParameterError(os.str());
  }
}
}  // namespace

Signal CrossoverStrategy::crossSignal(const std::vector<double>& fast,
                                      const std::vector<double>& slow, std::size_t i) {
  if (i == 0 || i >= fast.size() || i >= slow.size()) return Signal::Hold;
  const double f0 = fast[i - 1], s0 = slow[i - 1], f1 = fast[i], s1 = slow[i];
  if (std::isnan(f0) || std::isnan(s0) || std::isnan(f1) || std::isnan(s1)) return Signal::Hold;
  if (f0 <= s0 && f1 > s1) return Signal::Buy;
  if (f0 >= s0 && f1 < s1) return Signal::Sell;
  return Signal::Hold;
}

// ---- SMA ----
SmaCrossover::SmaCrossover(int fast, int slow) : fast_(fast), slow_(slow) {
  requireInt("fast", fast, 1, 500);
  requireInt("slow", slow, 2, 1000);
  if (fast >= slow) throw InvalidParameterError("'fast' must be smaller than 'slow'");
}
void SmaCrossover::prepare(const CandleSeries& c) {
  const auto cl = c.closes();
  fast_v_ = indicators::sma(cl, static_cast<std::size_t>(fast_));
  slow_v_ = indicators::sma(cl, static_cast<std::size_t>(slow_));
}
std::vector<IndicatorSeries> SmaCrossover::indicators() const {
  return {{"SMA " + std::to_string(fast_), "overlay", fast_v_},
          {"SMA " + std::to_string(slow_), "overlay", slow_v_}};
}

// ---- EMA ----
EmaCrossover::EmaCrossover(int fast, int slow) : fast_(fast), slow_(slow) {
  requireInt("fast", fast, 1, 500);
  requireInt("slow", slow, 2, 1000);
  if (fast >= slow) throw InvalidParameterError("'fast' must be smaller than 'slow'");
}
void EmaCrossover::prepare(const CandleSeries& c) {
  const auto cl = c.closes();
  fast_v_ = indicators::ema(cl, static_cast<std::size_t>(fast_));
  slow_v_ = indicators::ema(cl, static_cast<std::size_t>(slow_));
}
std::vector<IndicatorSeries> EmaCrossover::indicators() const {
  return {{"EMA " + std::to_string(fast_), "overlay", fast_v_},
          {"EMA " + std::to_string(slow_), "overlay", slow_v_}};
}

// ---- MACD ----
MacdCrossover::MacdCrossover(int fast, int slow, int signal)
    : fast_(fast), slow_(slow), signal_(signal) {
  requireInt("fast", fast, 1, 200);
  requireInt("slow", slow, 2, 400);
  requireInt("signal", signal, 1, 200);
  if (fast >= slow) throw InvalidParameterError("'fast' must be smaller than 'slow'");
}
void MacdCrossover::prepare(const CandleSeries& c) {
  const auto r = indicators::macd(c.closes(), static_cast<std::size_t>(fast_),
                                  static_cast<std::size_t>(slow_), static_cast<std::size_t>(signal_));
  macd_ = r.macd;
  signal_v_ = r.signal;
  hist_ = r.histogram;
}
std::vector<IndicatorSeries> MacdCrossover::indicators() const {
  return {{"MACD", "macd", macd_}, {"Signal", "macd", signal_v_}, {"Histogram", "macd", hist_}};
}

// ---- RSI ----
RsiStrategy::RsiStrategy(int period, double oversold, double overbought)
    : period_(period), oversold_(oversold), overbought_(overbought) {
  requireInt("period", period, 2, 200);
  if (!(oversold > 0 && oversold < overbought && overbought < 100))
    throw InvalidParameterError("require 0 < oversold < overbought < 100");
}
void RsiStrategy::prepare(const CandleSeries& c) {
  rsi_ = indicators::rsi(c.closes(), static_cast<std::size_t>(period_));
}
Signal RsiStrategy::signalAt(std::size_t i) const {
  if (i >= rsi_.size() || std::isnan(rsi_[i])) return Signal::Hold;
  if (rsi_[i] < oversold_) return Signal::Buy;
  if (rsi_[i] > overbought_) return Signal::Sell;
  return Signal::Hold;
}
std::vector<IndicatorSeries> RsiStrategy::indicators() const {
  return {{"RSI " + std::to_string(period_), "rsi", rsi_}};
}

// ---- factory ----
namespace {
double getParam(const ParamMap& p, const std::string& key, double def) {
  auto it = p.find(key);
  return it == p.end() ? def : it->second;
}
int asInt(const char* name, double v) {
  if (!std::isfinite(v) || std::floor(v) != v)
    throw InvalidParameterError(std::string("parameter '") + name + "' must be a whole number");
  if (std::fabs(v) > 1e6) throw InvalidParameterError(std::string("parameter '") + name + "' is out of range");
  return static_cast<int>(v);
}
void rejectUnknown(const ParamMap& p, std::initializer_list<const char*> allowed) {
  for (const auto& kv : p) {
    bool ok = false;
    for (const char* a : allowed) ok = ok || kv.first == a;
    if (!ok) throw InvalidParameterError("unknown parameter '" + kv.first + "'");
  }
}
}  // namespace

const std::vector<StrategyFactory::Entry>& StrategyFactory::registry() {
  static const std::vector<Entry> r = {
      {{"buy_and_hold", "Buy and Hold",
        "Buys on the first available bar and holds until the end of the data.", {}},
       [](const ParamMap& p) {
         rejectUnknown(p, {});
         return std::unique_ptr<Strategy>(new BuyAndHold());
       }},
      {{"sma_crossover", "SMA Crossover",
        "Buys when the fast simple moving average crosses above the slow one; sells on the opposite cross.",
        {{"fast", "Fast period", 10, 1, 500, true}, {"slow", "Slow period", 30, 2, 1000, true}}},
       [](const ParamMap& p) {
         rejectUnknown(p, {"fast", "slow"});
         return std::unique_ptr<Strategy>(new SmaCrossover(asInt("fast", getParam(p, "fast", 10)),
                                                          asInt("slow", getParam(p, "slow", 30))));
       }},
      {{"ema_crossover", "EMA Crossover",
        "Buys when the fast exponential moving average crosses above the slow one; sells on the opposite cross.",
        {{"fast", "Fast period", 12, 1, 500, true}, {"slow", "Slow period", 26, 2, 1000, true}}},
       [](const ParamMap& p) {
         rejectUnknown(p, {"fast", "slow"});
         return std::unique_ptr<Strategy>(new EmaCrossover(asInt("fast", getParam(p, "fast", 12)),
                                                          asInt("slow", getParam(p, "slow", 26))));
       }},
      {{"rsi_threshold", "RSI Threshold",
        "Buys when RSI falls below the oversold level; sells when it rises above the overbought level.",
        {{"period", "RSI period", 14, 2, 200, true},
         {"oversold", "Oversold level", 30, 1, 99, false},
         {"overbought", "Overbought level", 70, 1, 99, false}}},
       [](const ParamMap& p) {
         rejectUnknown(p, {"period", "oversold", "overbought"});
         return std::unique_ptr<Strategy>(new RsiStrategy(asInt("period", getParam(p, "period", 14)),
                                                         getParam(p, "oversold", 30),
                                                         getParam(p, "overbought", 70)));
       }},
      {{"macd_crossover", "MACD Crossover",
        "Buys when the MACD line crosses above its signal line; sells on the opposite cross.",
        {{"fast", "Fast EMA", 12, 1, 200, true},
         {"slow", "Slow EMA", 26, 2, 400, true},
         {"signal", "Signal EMA", 9, 1, 200, true}}},
       [](const ParamMap& p) {
         rejectUnknown(p, {"fast", "slow", "signal"});
         return std::unique_ptr<Strategy>(new MacdCrossover(asInt("fast", getParam(p, "fast", 12)),
                                                           asInt("slow", getParam(p, "slow", 26)),
                                                           asInt("signal", getParam(p, "signal", 9))));
       }},
  };
  return r;
}

std::unique_ptr<Strategy> StrategyFactory::create(const std::string& type, const ParamMap& params) {
  for (const auto& e : registry())
    if (e.info.type == type) return e.make(params);
  throw InvalidParameterError("unknown strategy type '" + type + "'");
}

std::vector<StrategyInfo> StrategyFactory::catalog() {
  std::vector<StrategyInfo> out;
  for (const auto& e : registry()) out.push_back(e.info);
  return out;
}

}  // namespace pbe
