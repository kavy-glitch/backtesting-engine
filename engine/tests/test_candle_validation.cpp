#include <gtest/gtest.h>

#include "test_util.hpp"

using namespace pbe;
using namespace testutil;

namespace {
const std::vector<double> kPrices = {100, 100, 100, 110, 120, 130, 130, 130};  // buy @bar2 open, sell @bar5 open
}

// 7/8/9. invalid data, duplicates, gaps
TEST(CandleValidation, RejectsInvalidOhlc) {
  EXPECT_THROW(CandleSeries({bar(0, 100, 99, 98, 100)}), DataValidationError);   // high < open
  EXPECT_THROW(CandleSeries({bar(0, 100, 105, 101, 100)}), DataValidationError); // low > open
  EXPECT_THROW(CandleSeries({bar(0, -1, 5, -2, 1)}), DataValidationError);       // negative price
  EXPECT_THROW(CandleSeries({bar(0, 100, 105, 95, 100, -5)}), DataValidationError); // negative volume
  EXPECT_THROW(CandleSeries({bar(0, 0, 5, 0, 1)}), DataValidationError);         // zero price
}
TEST(CandleValidation, RejectsNaNAndInfinity) {
  const double nan = std::numeric_limits<double>::quiet_NaN();
  const double inf = std::numeric_limits<double>::infinity();
  EXPECT_THROW(CandleSeries({bar(0, nan, 5, 1, 2)}), DataValidationError);
  EXPECT_THROW(CandleSeries({bar(0, 1, inf, 1, 2)}), DataValidationError);
}
TEST(CandleValidation, RejectsDuplicateAndUnsortedTimestamps) {
  EXPECT_THROW(CandleSeries({bar(0, 1, 2, 1, 1), bar(0, 1, 2, 1, 1)}), DataValidationError);
  EXPECT_THROW(CandleSeries({bar(1, 1, 2, 1, 1), bar(0, 1, 2, 1, 1)}), DataValidationError);
}
TEST(CandleValidation, RejectsImpossibleDates) {
  Candle c = bar(0, 1, 2, 1, 1);
  c.date = "2024-02-30";
  EXPECT_THROW(CandleSeries({c}), DataValidationError);
  c.date = "01/02/2024";
  EXPECT_THROW(CandleSeries({c}), DataValidationError);
  EXPECT_THROW(CandleSeries(std::vector<Candle>{}), DataValidationError);
}
TEST(CandleValidation, LargeGapProducesWarningNotError) {
  CandleSeries s({bar(0, 1, 2, 1, 1), bar(30, 1, 2, 1, 1)});
  ASSERT_EQ(s.warnings().size(), 1u);
  EXPECT_NE(s.warnings()[0].find("possible missing candles"), std::string::npos);
  CandleSeries ok({bar(0, 1, 2, 1, 1), bar(3, 1, 2, 1, 1)});  // weekend-sized gap
  EXPECT_TRUE(ok.warnings().empty());
}

