#include <gtest/gtest.h>

#include <cmath>

#include "pbe/core/containers.hpp"
#include "pbe/strategy/indicators.hpp"
#include "pbe/core/money.hpp"
#include "test_util.hpp"

using namespace pbe;
using namespace testutil;
using indicators::kNaN;

TEST(Indicators, SmaKnownValues) {
  auto v = indicators::sma({1, 2, 3, 4, 5}, 3);
  EXPECT_TRUE(std::isnan(v[0]));
  EXPECT_TRUE(std::isnan(v[1]));
  EXPECT_DOUBLE_EQ(v[2], 2);
  EXPECT_DOUBLE_EQ(v[3], 3);
  EXPECT_DOUBLE_EQ(v[4], 4);
}
TEST(Indicators, EmaKnownValues) {
  auto v = indicators::ema({1, 2, 3, 4, 5}, 3);  // seed = SMA(1,2,3)=2, alpha = 0.5
  EXPECT_TRUE(std::isnan(v[1]));
  EXPECT_DOUBLE_EQ(v[2], 2);
  EXPECT_DOUBLE_EQ(v[3], 3);
  EXPECT_DOUBLE_EQ(v[4], 4);
}
TEST(Indicators, EmaSkipsLeadingNaN) {
  auto v = indicators::ema({kNaN, kNaN, 1, 2, 3}, 3);
  EXPECT_TRUE(std::isnan(v[3]));
  EXPECT_DOUBLE_EQ(v[4], 2);
}
TEST(Indicators, RsiKnownValuesAndLimits) {
  auto v = indicators::rsi({10, 11, 10, 12}, 2);  // hand-computed in docs/engine.md
  EXPECT_TRUE(std::isnan(v[1]));
  EXPECT_DOUBLE_EQ(v[2], 50.0);
  EXPECT_NEAR(v[3], 100.0 - 100.0 / 6.0, 1e-9);
  auto up = indicators::rsi({1, 2, 3, 4, 5}, 2);
  EXPECT_DOUBLE_EQ(up[4], 100.0);
  auto flat = indicators::rsi({5, 5, 5, 5}, 2);
  EXPECT_DOUBLE_EQ(flat[3], 50.0);  // zero gain and zero loss: neutral, not NaN
}
TEST(Indicators, MacdWarmupAndRelation) {
  std::vector<double> c;
  for (auto& k : randomWalk(80)) c.push_back(k.close);
  auto m = indicators::macd(c, 12, 26, 9);
  EXPECT_TRUE(std::isnan(m.macd[24]));
  EXPECT_FALSE(std::isnan(m.macd[25]));
  EXPECT_TRUE(std::isnan(m.signal[32]));
  EXPECT_FALSE(std::isnan(m.signal[33]));
  EXPECT_NEAR(m.histogram[40], m.macd[40] - m.signal[40], 1e-12);
}
TEST(Indicators, ShortInputsYieldAllNaNInsteadOfCrashing) {
  for (double x : indicators::sma({1, 2}, 5)) EXPECT_TRUE(std::isnan(x));
  for (double x : indicators::ema({1, 2}, 5)) EXPECT_TRUE(std::isnan(x));
  for (double x : indicators::rsi({1, 2}, 5)) EXPECT_TRUE(std::isnan(x));
}

