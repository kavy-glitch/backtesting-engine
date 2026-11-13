// broker.hpp - execution model: fill prices, fees, position sizing.
#pragma once
#include <cmath>

#include "pbe/core/types.hpp"

namespace pbe {

class Broker {
 public:
  explicit Broker(ExecutionCosts costs) : costs_(costs) {}

  // Slippage always works against the trader: buys fill higher, sells fill lower.
  double buyFill(double price) const { return price * (1.0 + costs_.slippageBps / 10000.0); }
  double sellFill(double price) const { return price * (1.0 - costs_.slippageBps / 10000.0); }
  double fee(double notional) const { return notional * costs_.feePct / 100.0 + costs_.feeFlat; }

  // Largest quantity whose cost (including fee) fits in `budget`. 0 when nothing is affordable.
  double affordableQuantity(double budget, double fillPrice, bool fractional) const {
    const double perUnit = fillPrice * (1.0 + costs_.feePct / 100.0);
    const double raw = (budget - costs_.feeFlat) / perUnit;
    if (!(raw > 0)) return 0.0;
    if (fractional) return raw;
    double q = std::floor(raw);
    // guard against floating point edge cases so cost never exceeds the budget
    while (q > 0 && q * fillPrice + fee(q * fillPrice) > budget + 1e-9) q -= 1.0;
    return q;
  }

 private:
  ExecutionCosts costs_;
};

}  // namespace pbe
