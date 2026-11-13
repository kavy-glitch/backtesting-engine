#pragma once
#include <algorithm>
#include <array>
#include <limits>
#include <memory>
#include <sstream>
#include <cstdio>
#include <map>
#include <string>
#include <vector>

#include "pbe/execution/backtester.hpp"
#include "pbe/data/candle_series.hpp"
#include "pbe/core/date_util.hpp"
#include "pbe/core/errors.hpp"
#include "pbe/execution/metrics.hpp"
#include "pbe/strategy/strategy.hpp"

namespace testutil {

inline std::string dateAt(long offset) {  // 2024-01-01 + offset days
  long z = pbe::daysFromCivil(2024, 1, 1) + offset + 719468;
  const long era = (z >= 0 ? z : z - 146096) / 146097;
  const unsigned doe = static_cast<unsigned>(z - era * 146097);
  const unsigned yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  long y = static_cast<long>(yoe) + era * 400;
  const unsigned doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  const unsigned mp = (5 * doy + 2) / 153;
  const unsigned d = doy - (153 * mp + 2) / 5 + 1;
  const unsigned m = mp < 10 ? mp + 3 : mp - 9;
  y += (m <= 2);
  char buf[48];
  std::snprintf(buf, sizeof buf, "%04ld-%02u-%02u", y, m, d);
  return buf;
}

inline pbe::Candle bar(long i, double o, double h, double l, double c, double v = 1000) {
  return pbe::Candle{dateAt(i), o, h, l, c, v};
}

// Every bar has open = high = low = close = price.
inline std::vector<pbe::Candle> flatBars(const std::vector<double>& prices) {
  std::vector<pbe::Candle> out;
  for (std::size_t i = 0; i < prices.size(); ++i)
    out.push_back(bar(static_cast<long>(i), prices[i], prices[i], prices[i], prices[i]));
  return out;
}

// Deterministic pseudo random walk (no <random> so results are identical everywhere).
inline std::vector<pbe::Candle> randomWalk(std::size_t n, unsigned seed = 7) {
  std::vector<pbe::Candle> out;
  double p = 100.0;
  unsigned s = seed;
  for (std::size_t i = 0; i < n; ++i) {
    s = s * 1664525u + 1013904223u;
    const double r = (static_cast<double>((s >> 8) & 0xFFFF) / 65535.0 - 0.5) * 0.06;
    const double o = p;
    const double c = p * (1.0 + r);
    const double h = std::max(o, c) * 1.005;
    const double l = std::min(o, c) * 0.995;
    out.push_back(bar(static_cast<long>(i), o, h, l, c));
    p = c;
  }
  return out;
}

// A strategy whose signals are written by the test: lets us test accounting in isolation.
class ScriptedStrategy : public pbe::Strategy {
 public:
  explicit ScriptedStrategy(std::map<std::size_t, pbe::Signal> script) : script_(std::move(script)) {}
  std::string type() const override { return "scripted"; }
  std::string displayName() const override { return "Scripted"; }
  pbe::ParamMap params() const override { return {}; }
  std::size_t warmupBars() const override { return 0; }
  void prepare(const pbe::CandleSeries&) override {}
  pbe::Signal signalAt(std::size_t i) const override {
    auto it = script_.find(i);
    return it == script_.end() ? pbe::Signal::Hold : it->second;
  }

 private:
  std::map<std::size_t, pbe::Signal> script_;
};

inline pbe::BacktestResult runScripted(const std::vector<pbe::Candle>& candles,
                                       std::map<std::size_t, pbe::Signal> script,
                                       pbe::BacktestConfig cfg = {}) {
  ScriptedStrategy s(std::move(script));
  return pbe::Backtester(cfg).run(pbe::CandleSeries(candles), s);
}

}  // namespace testutil
