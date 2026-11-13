// indicators.hpp - technical indicators. Every function returns a vector the same length
// as the input; positions where the indicator is not yet defined hold quiet NaN.
// Value at index i depends ONLY on inputs [0..i], so no look-ahead is possible.
#pragma once
#include <cmath>
#include <limits>
#include <vector>

namespace pbe {
namespace indicators {

constexpr double kNaN = std::numeric_limits<double>::quiet_NaN();

// Simple moving average over `period` values (first value at index period-1).
std::vector<double> sma(const std::vector<double>& v, std::size_t period);
// Exponential moving average, alpha = 2/(period+1), seeded with the SMA of the first
// `period` valid values. Leading NaNs in the input are skipped.
std::vector<double> ema(const std::vector<double>& v, std::size_t period);
// Wilder's RSI. First value at index `period`.
std::vector<double> rsi(const std::vector<double>& v, std::size_t period);

struct MacdResult {
  std::vector<double> macd, signal, histogram;
};
MacdResult macd(const std::vector<double>& v, std::size_t fast, std::size_t slow,
                std::size_t signal);

}  // namespace indicators
}  // namespace pbe
