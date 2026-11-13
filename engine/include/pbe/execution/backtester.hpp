// backtester.hpp - the simulation loop.
//
// EXECUTION RULES (also documented in docs/engine.md)
//  For every bar i, in this order:
//   1. A signal produced at the close of bar i-1 is executed at the OPEN of bar i
//      (buy fills at open*(1+slippage), sell at open*(1-slippage), plus fees).
//   2. If a position is open, stop-loss / take-profit are checked against bar i's range.
//      Gaps fill at the open; otherwise at the trigger price. If both levels lie inside the
//      same bar, the stop-loss is assumed to be hit first (conservative).
//   3. The portfolio is marked to market at the CLOSE of bar i.
//   4. The strategy sees bars [0..i] only and may emit a signal for bar i+1.
//  Long-only, no leverage, one position at a time.
#pragma once
#include <optional>
#include <string>
#include <vector>

#include "pbe/data/candle_series.hpp"
#include "pbe/execution/metrics.hpp"
#include "pbe/strategy/strategy.hpp"
#include "pbe/core/types.hpp"

namespace pbe {

struct BacktestConfig {
  std::string symbol = "ASSET";
  double initialCapital = 100000.0;
  SizingMode sizingMode = SizingMode::PercentEquity;
  double sizingValue = 100.0;  // percent of cash (PercentEquity) or units (FixedQuantity)
  ExecutionCosts costs;
  std::optional<double> stopLossPct, takeProfitPct;
  double riskFreeRate = 0.0;  // annual, e.g. 0.06 for 6%
  bool allowFractional = false;

  void validate() const;  // throws InvalidParameterError
};

struct BacktestResult {
  std::vector<Trade> trades;           // closed trades
  std::optional<Trade> openTrade;      // position still open at the last bar (unrealized)
  std::vector<EquityPoint> equity;     // one point per candle
  std::vector<EquityPoint> benchmark;  // buy-and-hold, one point per candle
  std::vector<RejectedOrder> rejected;
  std::vector<IndicatorSeries> indicators;
  Metrics metrics;
  std::vector<std::string> warnings;
};

class Backtester {
 public:
  explicit Backtester(BacktestConfig cfg) : cfg_(std::move(cfg)) {}
  BacktestResult run(const CandleSeries& candles, Strategy& strategy) const;

 private:
  std::vector<EquityPoint> buyAndHoldBenchmark(const CandleSeries& candles) const;
  BacktestConfig cfg_;
};

}  // namespace pbe
