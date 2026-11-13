#include "pbe/data/candle_series.hpp"

#include <algorithm>
#include <cmath>
#include <sstream>

#include "pbe/core/date_util.hpp"
#include "pbe/core/errors.hpp"

namespace pbe {

namespace {
[[noreturn]] void fail(std::size_t idx, const std::string& date, const std::string& what) {
  std::ostringstream os;
  os << "candle #" << idx << " (" << date << "): " << what;
  throw DataValidationError(os.str());
}
}  // namespace

CandleSeries::CandleSeries(std::vector<Candle> candles, ValidationOptions opt)
    : candles_(std::move(candles)) {
  if (candles_.empty()) throw DataValidationError("no candles supplied");

  for (std::size_t i = 0; i < candles_.size(); ++i) {
    const Candle& c = candles_[i];
    int y, m, d;
    if (!parseIsoDate(c.date, y, m, d)) fail(i, c.date, "invalid date (expected YYYY-MM-DD)");
    const double fields[4] = {c.open, c.high, c.low, c.close};
    for (double f : fields) {
      if (std::isnan(f)) fail(i, c.date, "missing value in open/high/low/close");
      if (!std::isfinite(f)) fail(i, c.date, "non-finite price");
      if (f <= 0) fail(i, c.date, "prices must be strictly positive");
    }
    if (std::isnan(c.volume)) fail(i, c.date, "missing volume");
    if (!std::isfinite(c.volume) || c.volume < 0) fail(i, c.date, "volume must be finite and >= 0");
    if (c.high < std::max({c.open, c.close, c.low}))
      fail(i, c.date, "invalid OHLC: high is below open/close/low");
    if (c.low > std::min({c.open, c.close, c.high}))
      fail(i, c.date, "invalid OHLC: low is above open/close/high");

    if (i > 0) {
      const std::string& prev = candles_[i - 1].date;
      if (c.date == prev) fail(i, c.date, "duplicate timestamp");
      if (c.date < prev) fail(i, c.date, "dates are not sorted ascending");
      const long gap = daysBetween(prev, c.date);
      if (gap > opt.maxGapDays) {
        std::ostringstream os;
        os << "gap of " << gap << " days between " << prev << " and " << c.date
           << " (possible missing candles)";
        warnings_.push_back(os.str());
      }
    }
  }
}

std::vector<double> CandleSeries::closes() const {
  std::vector<double> out;
  out.reserve(candles_.size());
  std::transform(candles_.begin(), candles_.end(), std::back_inserter(out),
                 [](const Candle& c) { return c.close; });
  return out;
}

CandleSeries CandleSeries::head(std::size_t n) const {
  n = std::min(n, candles_.size());
  CandleSeries s;
  s.candles_.assign(candles_.begin(), candles_.begin() + static_cast<long>(n));
  return s;
}

}  // namespace pbe
