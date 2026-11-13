#include <gtest/gtest.h>

#include <cmath>

#include "pbe/core/containers.hpp"
#include "pbe/strategy/indicators.hpp"
#include "pbe/core/money.hpp"
#include "test_util.hpp"

using namespace pbe;
using namespace testutil;
using indicators::kNaN;

// ---- OOP building blocks ----
TEST(OopBlocks, NumericBufferDeepCopyAndAssignment) {
  NumericBuffer a;
  for (int i = 0; i < 100; ++i) a.push_back(i);  // forces several reallocations
  NumericBuffer b(a);                             // copy constructor
  a[0] = -1;
  EXPECT_DOUBLE_EQ(b[0], 0);                      // independent storage
  NumericBuffer c;
  c = b;                                          // copy assignment
  b[1] = 99;
  EXPECT_DOUBLE_EQ(c[1], 1);
  c = c;                                          // self-assignment is safe
  EXPECT_EQ(c.size(), 100u);
  NumericBuffer d(std::move(c));                  // move constructor
  EXPECT_EQ(d.size(), 100u);
  EXPECT_EQ(c.size(), 0u);
}
TEST(OopBlocks, MoneyOperators) {
  Money a(10.5), b(2.0);
  EXPECT_DOUBLE_EQ((a + b).value(), 12.5);
  EXPECT_DOUBLE_EQ((a - b).value(), 8.5);
  EXPECT_DOUBLE_EQ((a * 2).value(), 21.0);
  EXPECT_DOUBLE_EQ((2 * a).value(), 21.0);  // friend operator*(double, Money)
  a += b;
  EXPECT_TRUE(a > b);
  std::ostringstream os;
  os << Money(3.25);
  EXPECT_EQ(os.str(), "3.25");
}
TEST(OopBlocks, RollingWindowTemplateWorksForIntAndDouble) {
  RollingWindow<int> w(3);
  for (int i = 1; i <= 5; ++i) w.push(i);  // keeps 3,4,5
  EXPECT_EQ(w.sum(), 12);
  EXPECT_THROW(RollingWindow<double>(0), InvalidParameterError);
}
TEST(OopBlocks, DateHelpers) {
  EXPECT_EQ(daysBetween("2024-02-28", "2024-03-01"), 2);  // leap year
  EXPECT_EQ(daysBetween("2023-02-28", "2023-03-01"), 1);
  EXPECT_THROW(daysBetween("2023-02-29", "2023-03-01"), DataValidationError);
}
