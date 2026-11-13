#include <gtest/gtest.h>

#include "test_util.hpp"

using namespace pbe;
using namespace testutil;

namespace {
const std::vector<double> kPrices = {100, 100, 100, 110, 120, 130, 130, 130};  // buy @bar2 open, sell @bar5 open
}

// 1. no trades
TEST(Backtest, NoTradesLeavesCapitalUntouched) {
  auto r = runScripted(flatBars(kPrices), {});
  EXPECT_TRUE(r.trades.empty());
  EXPECT_FALSE(r.openTrade.has_value());
  for (const auto& p : r.equity) EXPECT_DOUBLE_EQ(p.equity, 100000.0);
  EXPECT_DOUBLE_EQ(r.metrics.netProfit, 0.0);
  EXPECT_FALSE(r.metrics.winRatePct.has_value());
  EXPECT_TRUE(r.metrics.notes.count("win_rate_pct"));
}

// 2. one profitable trade (also proves: signal at close i executes at open i+1)
TEST(Backtest, OneProfitableTrade) {
  BacktestConfig cfg; cfg.initialCapital = 10000;
  auto r = runScripted(flatBars(kPrices), {{1, Signal::Buy}, {4, Signal::Sell}}, cfg);
  ASSERT_EQ(r.trades.size(), 1u);
  const Trade& t = r.trades[0];
  EXPECT_EQ(t.entryIndex, 2u);  // signal at bar 1 -> fill at bar 2
  EXPECT_EQ(t.exitIndex, 5u);   // signal at bar 4 -> fill at bar 5
  EXPECT_DOUBLE_EQ(t.entryPrice, 100.0);
  EXPECT_DOUBLE_EQ(t.exitPrice, 130.0);
  EXPECT_DOUBLE_EQ(t.quantity, 100.0);
  EXPECT_DOUBLE_EQ(t.grossPnl, 3000.0);
  EXPECT_DOUBLE_EQ(t.netPnl, 3000.0);
  EXPECT_DOUBLE_EQ(t.returnPct, 30.0);
  EXPECT_EQ(t.holdingDays, 3);
  EXPECT_DOUBLE_EQ(r.equity.back().equity, 13000.0);
  EXPECT_EQ(r.metrics.winningTrades, 1);
  EXPECT_DOUBLE_EQ(*r.metrics.winRatePct, 100.0);
  EXPECT_FALSE(r.metrics.profitFactor.has_value());  // no losing trades -> explained null
  EXPECT_TRUE(r.metrics.notes.count("profit_factor"));
}

// 3. one losing trade
TEST(Backtest, OneLosingTrade) {
  BacktestConfig cfg; cfg.initialCapital = 10000;
  auto r = runScripted(flatBars({100, 100, 100, 90, 80, 80, 80}), {{1, Signal::Buy}, {3, Signal::Sell}}, cfg);
  ASSERT_EQ(r.trades.size(), 1u);
  EXPECT_DOUBLE_EQ(r.trades[0].netPnl, -2000.0);  // 100 shares, 100 -> 80
  EXPECT_EQ(r.metrics.losingTrades, 1);
  EXPECT_DOUBLE_EQ(*r.metrics.winRatePct, 0.0);
  EXPECT_DOUBLE_EQ(*r.metrics.avgLoss, -2000.0);
  EXPECT_DOUBLE_EQ(r.metrics.finalEquity, 8000.0);
}

// 4. insufficient capital
TEST(Backtest, InsufficientCapitalRejectsOrder) {
  BacktestConfig cfg; cfg.initialCapital = 50;  // one share costs 100
  auto r = runScripted(flatBars(kPrices), {{1, Signal::Buy}}, cfg);
  EXPECT_TRUE(r.trades.empty());
  ASSERT_EQ(r.rejected.size(), 1u);
  EXPECT_EQ(r.rejected[0].side, "BUY");
  EXPECT_NE(r.rejected[0].reason.find("insufficient funds"), std::string::npos);
  EXPECT_DOUBLE_EQ(r.metrics.finalEquity, 50.0);
}
TEST(Backtest, FixedQuantityBeyondCashIsRejectedNotLeveraged) {
  BacktestConfig cfg; cfg.initialCapital = 1000;
  cfg.sizingMode = SizingMode::FixedQuantity; cfg.sizingValue = 50;  // would cost 5000
  auto r = runScripted(flatBars(kPrices), {{1, Signal::Buy}}, cfg);
  EXPECT_TRUE(r.trades.empty());
  EXPECT_EQ(r.rejected.size(), 1u);
  for (const auto& p : r.equity) EXPECT_GE(p.cash, 0.0);
}

// 5. transaction fees
TEST(Backtest, PercentFeesAreChargedOnBothSides) {
  BacktestConfig cfg; cfg.initialCapital = 10000; cfg.costs.feePct = 0.1;
  auto r = runScripted(flatBars(kPrices), {{1, Signal::Buy}, {4, Signal::Sell}}, cfg);
  ASSERT_EQ(r.trades.size(), 1u);
  const Trade& t = r.trades[0];
  EXPECT_DOUBLE_EQ(t.quantity, 99.0);  // 100 shares would cost 10010 > 10000
  EXPECT_NEAR(t.entryFee, 9.9, 1e-9);
  EXPECT_NEAR(t.exitFee, 12.87, 1e-9);
  EXPECT_NEAR(t.grossPnl, 2970.0, 1e-9);
  EXPECT_NEAR(t.netPnl, 2970.0 - 9.9 - 12.87, 1e-9);
  EXPECT_NEAR(r.metrics.totalFees, 22.77, 1e-9);
}
TEST(Backtest, FlatFeeReducesAffordableQuantity) {
  BacktestConfig cfg; cfg.initialCapital = 1000; cfg.costs.feeFlat = 20;
  auto r = runScripted(flatBars(kPrices), {{1, Signal::Buy}}, cfg);
  ASSERT_TRUE(r.openTrade.has_value());
  EXPECT_DOUBLE_EQ(r.openTrade->quantity, 9.0);  // (1000-20)/100 = 9.8 -> 9
  EXPECT_DOUBLE_EQ(r.openTrade->entryFee, 20.0);
}

// 6. slippage
TEST(Backtest, SlippageWorksAgainstTheTrader) {
  BacktestConfig cfg; cfg.initialCapital = 10000; cfg.costs.slippageBps = 100;  // 1%
  auto r = runScripted(flatBars(kPrices), {{1, Signal::Buy}, {4, Signal::Sell}}, cfg);
  ASSERT_EQ(r.trades.size(), 1u);
  const Trade& t = r.trades[0];
  EXPECT_NEAR(t.entryPrice, 101.0, 1e-9);
  EXPECT_NEAR(t.exitPrice, 128.7, 1e-9);
  EXPECT_DOUBLE_EQ(t.quantity, 99.0);
  EXPECT_NEAR(t.netPnl, (128.7 - 101.0) * 99.0, 1e-6);
}

// 10/11/12. accounting identities
TEST(Backtest, CashAccountingAndValuationIdentities) {
  auto candles = randomWalk(200);
  BacktestConfig cfg; cfg.initialCapital = 50000; cfg.costs.feePct = 0.05; cfg.costs.slippageBps = 5;
  auto strat = StrategyFactory::create("sma_crossover", {{"fast", 5}, {"slow", 20}});
  auto r = Backtester(cfg).run(CandleSeries(candles), *strat);
  ASSERT_GT(r.trades.size(), 2u);
  for (std::size_t i = 0; i < r.equity.size(); ++i) {
    EXPECT_GE(r.equity[i].cash, -1e-6) << "cash went negative at bar " << i;  // no leverage
    EXPECT_NEAR(r.equity[i].equity, r.equity[i].cash + r.equity[i].positionValue, 1e-6);
  }
  // final equity = initial + realized + unrealized
  EXPECT_NEAR(r.metrics.finalEquity,
              cfg.initialCapital + r.metrics.realizedPnl + r.metrics.unrealizedPnl, 1e-6);
  double sum = 0;
  for (const auto& t : r.trades) {
    EXPECT_NEAR(t.netPnl, t.grossPnl - t.entryFee - t.exitFee, 1e-9);
    EXPECT_NEAR(t.grossPnl, (t.exitPrice - t.entryPrice) * t.quantity, 1e-9);
    sum += t.netPnl;
  }
  EXPECT_NEAR(sum, r.metrics.realizedPnl, 1e-9);
}
TEST(Backtest, OpenPositionIsValuedAtLastCloseAndReportedAsUnrealized) {
  BacktestConfig cfg; cfg.initialCapital = 10000;
  auto r = runScripted(flatBars(kPrices), {{1, Signal::Buy}}, cfg);
  ASSERT_TRUE(r.openTrade.has_value());
  EXPECT_EQ(r.openTrade->status, "open");
  EXPECT_DOUBLE_EQ(r.openTrade->netPnl, 3000.0);  // 100 shares, 100 -> 130
  EXPECT_DOUBLE_EQ(r.metrics.unrealizedPnl, 3000.0);
  EXPECT_DOUBLE_EQ(r.metrics.realizedPnl, 0.0);
  EXPECT_DOUBLE_EQ(r.equity.back().equity, 13000.0);
  EXPECT_EQ(r.metrics.closedTrades, 0);
}

// 13. drawdown & 14. benchmark
TEST(Backtest, MaxDrawdownAndBenchmark) {
  std::vector<Candle> c = {bar(0, 100, 105, 100, 105), bar(1, 100, 100, 100, 100), bar(2, 120, 120, 120, 120),
                           bar(3, 90, 90, 90, 90), bar(4, 110, 110, 110, 110)};
  BacktestConfig cfg; cfg.initialCapital = 10000;
  BuyAndHold s;
  auto r = Backtester(cfg).run(CandleSeries(c), s);
  // strategy buys at bar 1 open (100): equity 10000, 10000, 12000, 9000, 11000
  ASSERT_EQ(r.equity.size(), 5u);
  EXPECT_DOUBLE_EQ(r.equity[2].equity, 12000.0);
  EXPECT_DOUBLE_EQ(r.equity[3].equity, 9000.0);
  EXPECT_NEAR(r.metrics.maxDrawdownPct, 25.0, 1e-9);
  EXPECT_NEAR(r.equity[3].drawdownPct, -25.0, 1e-9);
  // benchmark buys at bar 0 open (100) and is valued at each close: 10500 ... 11000
  EXPECT_DOUBLE_EQ(r.benchmark[0].equity, 10500.0);
  EXPECT_DOUBLE_EQ(r.benchmark.back().equity, 11000.0);
  EXPECT_NEAR(r.metrics.buyHoldReturnPct, 10.0, 1e-9);
  EXPECT_NEAR(r.metrics.totalReturnPct, 10.0, 1e-9);
}
// 15. insufficient data
TEST(Backtest, TooFewCandlesForIndicatorThrows) {
  auto strat = StrategyFactory::create("sma_crossover", {{"fast", 10}, {"slow", 30}});
  EXPECT_THROW(Backtester(BacktestConfig{}).run(CandleSeries(randomWalk(20)), *strat), InsufficientDataError);
  auto exactlyEnough = StrategyFactory::create("sma_crossover", {{"fast", 10}, {"slow", 30}});
  EXPECT_NO_THROW(Backtester(BacktestConfig{}).run(CandleSeries(randomWalk(32)), *exactlyEnough));
}

// 16. no look-ahead: a signal computed on a truncated series equals the one from the full series
TEST(Backtest, SignalsNeverUseFutureData) {
  const CandleSeries full(randomWalk(260));
  for (const auto& info : StrategyFactory::catalog()) {
    auto fullStrat = StrategyFactory::create(info.type, {});
    fullStrat->prepare(full);
    for (std::size_t k = fullStrat->minimumCandles(); k <= full.size(); k += 3) {
      auto cut = StrategyFactory::create(info.type, {});
      cut->prepare(full.head(k));
      EXPECT_EQ(cut->signalAt(k - 1), fullStrat->signalAt(k - 1)) << info.type << " at bar " << (k - 1);
    }
  }
}
TEST(Backtest, ChangingFutureBarsDoesNotChangePastTrades) {
  auto base = randomWalk(150);
  auto altered = base;
  for (std::size_t i = 100; i < altered.size(); ++i) {  // rewrite the future
    altered[i].open *= 1.5; altered[i].high *= 1.5; altered[i].low *= 1.5; altered[i].close *= 1.5;
  }
  auto run = [](const std::vector<Candle>& c) {
    auto s = StrategyFactory::create("ema_crossover", {{"fast", 5}, {"slow", 15}});
    return Backtester(BacktestConfig{}).run(CandleSeries(c), *s);
  };
  const auto a = run(base), b = run(altered);
  for (std::size_t i = 0; i < 99; ++i) EXPECT_DOUBLE_EQ(a.equity[i].equity, b.equity[i].equity);
}

// stop-loss / take-profit
TEST(Backtest, StopLossExitsAtTriggerPrice) {
  std::vector<Candle> c = {bar(0, 100, 100, 100, 100), bar(1, 100, 100, 100, 100), bar(2, 100, 101, 100, 100),
                           bar(3, 100, 100, 85, 90), bar(4, 90, 90, 90, 90)};
  BacktestConfig cfg; cfg.initialCapital = 10000; cfg.stopLossPct = 10;
  auto r = runScripted(c, {{1, Signal::Buy}}, cfg);
  ASSERT_EQ(r.trades.size(), 1u);
  EXPECT_EQ(r.trades[0].exitReason, "stop_loss");
  EXPECT_DOUBLE_EQ(r.trades[0].exitPrice, 90.0);  // trigger price, not the low
  EXPECT_EQ(r.trades[0].exitIndex, 3u);
}
TEST(Backtest, GapBelowStopFillsAtOpen) {
  std::vector<Candle> c = {bar(0, 100, 100, 100, 100), bar(1, 100, 100, 100, 100), bar(2, 100, 100, 100, 100),
                           bar(3, 80, 82, 78, 80), bar(4, 80, 80, 80, 80)};
  BacktestConfig cfg; cfg.initialCapital = 10000; cfg.stopLossPct = 10;
  auto r = runScripted(c, {{1, Signal::Buy}}, cfg);
  ASSERT_EQ(r.trades.size(), 1u);
  EXPECT_DOUBLE_EQ(r.trades[0].exitPrice, 80.0);
}
TEST(Backtest, TakeProfitAndStopBothInsideOneBarAssumesStopFirst) {
  std::vector<Candle> c = {bar(0, 100, 100, 100, 100), bar(1, 100, 100, 100, 100), bar(2, 100, 100, 100, 100),
                           bar(3, 100, 130, 80, 100), bar(4, 100, 100, 100, 100)};
  BacktestConfig cfg; cfg.initialCapital = 10000; cfg.stopLossPct = 10; cfg.takeProfitPct = 20;
  auto r = runScripted(c, {{1, Signal::Buy}}, cfg);
  ASSERT_EQ(r.trades.size(), 1u);
  EXPECT_EQ(r.trades[0].exitReason, "stop_loss");
}
TEST(Backtest, TakeProfitHit) {
  std::vector<Candle> c = {bar(0, 100, 100, 100, 100), bar(1, 100, 100, 100, 100), bar(2, 100, 100, 100, 100),
                           bar(3, 100, 125, 99, 120), bar(4, 120, 120, 120, 120)};
  BacktestConfig cfg; cfg.initialCapital = 10000; cfg.takeProfitPct = 20;
  auto r = runScripted(c, {{1, Signal::Buy}}, cfg);
  ASSERT_EQ(r.trades.size(), 1u);
  EXPECT_EQ(r.trades[0].exitReason, "take_profit");
  EXPECT_DOUBLE_EQ(r.trades[0].exitPrice, 120.0);
}

// config validation
TEST(Backtest, RejectsInvalidConfiguration) {
  auto go = [](BacktestConfig cfg) {
    ScriptedStrategy s({});
    return Backtester(cfg).run(CandleSeries(flatBars(kPrices)), s);
  };
  BacktestConfig c; c.initialCapital = 0;
  EXPECT_THROW(go(c), InvalidParameterError);
  c = {}; c.costs.feePct = 100; EXPECT_THROW(go(c), InvalidParameterError);
  c = {}; c.costs.slippageBps = -1; EXPECT_THROW(go(c), InvalidParameterError);
  c = {}; c.sizingValue = 150; EXPECT_THROW(go(c), InvalidParameterError);
  c = {}; c.stopLossPct = 0; EXPECT_THROW(go(c), InvalidParameterError);
  c = {}; c.initialCapital = std::numeric_limits<double>::quiet_NaN(); EXPECT_THROW(go(c), InvalidParameterError);
}

// no repeated entries / exits
TEST(Backtest, DuplicateSignalsAreIgnored) {
  BacktestConfig cfg; cfg.initialCapital = 10000;
  auto r = runScripted(flatBars(kPrices), {{0, Signal::Buy}, {1, Signal::Buy}, {2, Signal::Buy}, {4, Signal::Sell}, {5, Signal::Sell}}, cfg);
  EXPECT_EQ(r.trades.size(), 1u);
  EXPECT_TRUE(r.rejected.empty());
}

// polymorphism: every registered strategy runs through the same base-class interface
TEST(Backtest, AllStrategiesRunPolymorphically) {
  const CandleSeries data(randomWalk(400, 11));
  std::vector<std::unique_ptr<Strategy>> all;
  for (const auto& info : StrategyFactory::catalog()) all.push_back(StrategyFactory::create(info.type, {}));
  EXPECT_EQ(all.size(), 5u);
  for (auto& s : all) {
    auto r = Backtester(BacktestConfig{}).run(data, *s);
    EXPECT_EQ(r.equity.size(), data.size()) << s->type();
    EXPECT_GE(r.metrics.maxDrawdownPct, 0.0);
  }
}
