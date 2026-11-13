// csv_loader.hpp - file handling: read OHLCV candles from a CSV file.
#pragma once
#include <string>
#include <vector>

#include "pbe/core/types.hpp"

namespace pbe {

class CsvCandleLoader {
 public:
  // Required header columns (case-insensitive): Date, Open, High, Low, Close, Volume.
  // Extra columns (e.g. "Adj Close") are ignored. Empty numeric cells become NaN so that
  // CandleSeries rejects them explicitly.
  static std::vector<Candle> load(const std::string& path);
  static std::vector<Candle> parse(const std::string& text);
};

}  // namespace pbe
