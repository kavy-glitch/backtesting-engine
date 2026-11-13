#include <gtest/gtest.h>

#include <cmath>

#include "test_util.hpp"

using namespace pbe;
using namespace testutil;

namespace {
const std::vector<double> kPrices = {100, 100, 100, 110, 120, 130, 130, 130};  // buy @bar2 open, sell @bar5 open
}

TEST(Metrics, MaxDrawdownHelper) {
  EXPECT_DOUBLE_EQ(MetricsCalculator::maxDrawdownPct({100, 110, 99, 120, 90}), 25.0);
  EXPECT_DOUBLE_EQ(MetricsCalculator::maxDrawdownPct({100, 101, 102}), 0.0);
  EXPECT_DOUBLE_EQ(MetricsCalculator::maxDrawdownPct({}), 0.0);
}

TEST(Metrics, ZeroVolatilityGivesExplainedNullNotNaN) {
  BuyAndHold s;
  auto r = Backtester(BacktestConfig{}).run(CandleSeries(flatBars({100, 100, 100, 100, 100})), s);
  EXPECT_FALSE(r.metrics.sharpe.has_value());
  EXPECT_TRUE(r.metrics.notes.count("sharpe_ratio"));
  EXPECT_DOUBLE_EQ(r.metrics.maxDrawdownPct, 0.0);
}
TEST(Metrics, TooFewObservationsGivesNull) {
  BuyAndHold s;
  auto r = Backtester(BacktestConfig{}).run(CandleSeries(flatBars({100, 101})), s);
  EXPECT_FALSE(r.metrics.sharpe.has_value());
  EXPECT_FALSE(r.metrics.sortino.has_value());
}
TEST(Metrics, SharpeMatchesHandCalculation) {
  // equity: 100, 110, 99, 108.9  -> returns +10%, -10%, +10%
  std::vector<EquityPoint> eq;
  const double e[] = {100, 110, 99, 108.9};
  for (int i = 0; i < 4; ++i) eq.push_back({dateAt(i), e[i], e[i], 0, 0});
  Metrics m = MetricsCalculator::compute(100, eq, {}, nullptr, 0.0, 0, 100);
  const double mean = (0.1 - 0.1 + 0.1) / 3.0;
  const double sd = std::sqrt(((0.1 - mean) * (0.1 - mean) * 2 + (-0.1 - mean) * (-0.1 - mean)) / 2.0);
  EXPECT_NEAR(*m.sharpe, mean / sd * std::sqrt(252.0), 1e-9);
  const double dd = std::sqrt((0.1 * 0.1) / 3.0);  // only the -10% return is below 0
  EXPECT_NEAR(*m.sortino, mean / dd * std::sqrt(252.0), 1e-9);
}
TEST(Metrics, ProfitFactorWinRateAverages) {
  auto mk = [](double pnl) { Trade t; t.netPnl = pnl; t.returnPct = pnl / 10; t.entryFee = 1; t.exitFee = 1; return t; };
  std::vector<Trade> trades = {mk(300), mk(-100), mk(100), mk(-50)};
  std::vector<EquityPoint> eq = {{"2024-01-01", 1000, 1000, 0, 0}, {"2024-01-02", 1250, 1250, 0, 0}};
  Metrics m = MetricsCalculator::compute(1000, eq, trades, nullptr, 0.0, 1, 1000);
  EXPECT_DOUBLE_EQ(*m.profitFactor, 400.0 / 150.0);
  EXPECT_DOUBLE_EQ(*m.winRatePct, 50.0);
  EXPECT_DOUBLE_EQ(*m.avgWin, 200.0);
  EXPECT_DOUBLE_EQ(*m.avgLoss, -75.0);
  EXPECT_EQ(m.winningTrades, 2);
  EXPECT_EQ(m.losingTrades, 2);
}

