// candle_series.hpp - validated, immutable-after-construction OHLCV series.
#pragma once
#include <string>
#include <vector>

#include "pbe/core/types.hpp"

namespace pbe {

struct ValidationOptions {
  long maxGapDays = 10;  // gaps above this produce a warning (not an error)
};

class CandleSeries {
 public:
  CandleSeries() = default;
  // Throws DataValidationError for any invalid data. Nothing is silently repaired.
  explicit CandleSeries(std::vector<Candle> candles, ValidationOptions opt = {});

  std::size_t size() const { return candles_.size(); }
  bool empty() const { return candles_.empty(); }
  const Candle& operator[](std::size_t i) const { return candles_[i]; }
  std::vector<Candle>::const_iterator begin() const { return candles_.begin(); }
  std::vector<Candle>::const_iterator end() const { return candles_.end(); }

  std::vector<double> closes() const;
  const std::vector<std::string>& warnings() const { return warnings_; }

  // First n candles only; used by the look-ahead-bias test.
  CandleSeries head(std::size_t n) const;

 private:
  std::vector<Candle> candles_;
  std::vector<std::string> warnings_;
};

}  // namespace pbe
