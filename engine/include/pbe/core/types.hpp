// types.hpp - plain data records shared across the engine.
#pragma once
#include <cstddef>
#include <optional>
#include <string>

namespace pbe {

struct Candle {
  std::string date;  // YYYY-MM-DD
  double open = 0, high = 0, low = 0, close = 0, volume = 0;
};

enum class Signal { Hold, Buy, Sell };

enum class SizingMode { PercentEquity, FixedQuantity };

struct ExecutionCosts {
  double feePct = 0.0;       // percent of traded value, per fill
  double feeFlat = 0.0;      // fixed currency amount, per fill
  double slippageBps = 0.0;  // adverse price move, basis points (1 bp = 0.01%)
};

struct Trade {
  int id = 0;
  std::string symbol;
  std::string direction = "LONG";
  std::string status = "closed";  // "closed" | "open"
  std::string entryDate, exitDate;
  std::size_t entryIndex = 0, exitIndex = 0;
  double entryPrice = 0, exitPrice = 0, quantity = 0;
  double entryFee = 0, exitFee = 0;
  double grossPnl = 0, netPnl = 0, returnPct = 0;
  long holdingDays = 0;
  std::string exitReason;  // signal | stop_loss | take_profit | open
};

struct EquityPoint {
  std::string date;
  double equity = 0, cash = 0, positionValue = 0, drawdownPct = 0;  // drawdownPct <= 0
};

struct RejectedOrder {
  std::string date, side, reason;
};

}  // namespace pbe
