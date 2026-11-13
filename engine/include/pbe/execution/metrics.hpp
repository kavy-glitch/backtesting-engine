// metrics.hpp - performance statistics. Definitions are documented in docs/engine.md.
#pragma once
#include <map>
#include <optional>
#include <string>
#include <vector>

#include "pbe/core/types.hpp"

namespace pbe {

struct Metrics {
  double initialCapital = 0, finalEquity = 0, netProfit = 0, totalReturnPct = 0;
  double realizedPnl = 0, unrealizedPnl = 0, totalFees = 0;
  double maxDrawdownPct = 0;  // positive number, e.g. 12.5 means a 12.5% peak-to-trough fall
  double exposurePct = 0;     // % of bars with an open position at the close
  int closedTrades = 0, winningTrades = 0, losingTrades = 0, breakevenTrades = 0;
  std::optional<double> cagrPct, annualVolatilityPct, sharpe, sortino;
  std::optional<double> winRatePct, avgTradeReturnPct, avgWin, avgLoss, profitFactor;
  double buyHoldReturnPct = 0, buyHoldFinalEquity = 0;
  // Explains every metric that is null (never silently NaN/inf).
  std::map<std::string, std::string> notes;
};

class MetricsCalculator {
 public:
  static constexpr double kTradingDays = 252.0;

  static Metrics compute(double initialCapital, const std::vector<EquityPoint>& equity,
                         const std::vector<Trade>& closedTrades, const Trade* openTrade,
                         double riskFreeRate, double exposureBars, double buyHoldFinal);

  // exposed for unit tests
  static double maxDrawdownPct(const std::vector<double>& equity);
  static std::vector<double> simpleReturns(const std::vector<double>& equity);
};

}  // namespace pbe
