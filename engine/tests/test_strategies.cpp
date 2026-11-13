#include <gtest/gtest.h>

#include <cmath>

#include "pbe/core/containers.hpp"
#include "pbe/strategy/indicators.hpp"
#include "pbe/core/money.hpp"
#include "test_util.hpp"

using namespace pbe;
using namespace testutil;
using indicators::kNaN;

TEST(Strategies, ParameterValidation) {
  EXPECT_THROW(StrategyFactory::create("sma_crossover", {{"fast", 30}, {"slow", 10}}), InvalidParameterError);
  EXPECT_THROW(StrategyFactory::create("sma_crossover", {{"fast", 0}, {"slow", 10}}), InvalidParameterError);
  EXPECT_THROW(StrategyFactory::create("sma_crossover", {{"fast", 2.5}, {"slow", 10}}), InvalidParameterError);
  EXPECT_THROW(StrategyFactory::create("sma_crossover", {{"bogus", 1}}), InvalidParameterError);
  EXPECT_THROW(StrategyFactory::create("rsi_threshold", {{"oversold", 80}, {"overbought", 70}}), InvalidParameterError);
  EXPECT_THROW(StrategyFactory::create("nope", {}), InvalidParameterError);
  EXPECT_NO_THROW(StrategyFactory::create("macd_crossover", {}));
}
TEST(Strategies, StaticInstanceCounterAndVirtualDestructor) {
  const int before = Strategy::instancesCreated();
  {
    std::unique_ptr<Strategy> s = StrategyFactory::create("sma_crossover", {});  // deleted via base pointer
    EXPECT_EQ(Strategy::instancesCreated(), before + 1);
  }
  EXPECT_EQ(Strategy::instancesCreated(), before + 1);  // counts creations, not live objects
}
TEST(Strategies, SmaCrossoverEmitsBuyThenSell) {
  // rises then falls so that the fast SMA crosses above, then below, the slow SMA
  std::vector<double> p;
  for (int i = 0; i < 15; ++i) p.push_back(100 - i);        // downtrend
  for (int i = 0; i < 25; ++i) p.push_back(86 + 3 * i);     // strong uptrend
  for (int i = 0; i < 25; ++i) p.push_back(158 - 3 * i);    // strong downtrend
  CandleSeries c(flatBars(p));
  auto s = StrategyFactory::create("sma_crossover", {{"fast", 3}, {"slow", 8}});
  s->prepare(c);
  int buys = 0, sells = 0;
  for (std::size_t i = 0; i < c.size(); ++i) {
    if (s->signalAt(i) == Signal::Buy) ++buys;
    if (s->signalAt(i) == Signal::Sell) ++sells;
  }
  EXPECT_GE(buys, 1);
  EXPECT_GE(sells, 1);
}

