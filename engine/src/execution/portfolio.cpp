#include "pbe/execution/portfolio.hpp"

#include <numeric>
#include <sstream>

#include "pbe/core/date_util.hpp"
#include "pbe/core/errors.hpp"

namespace pbe {

const Position* Portfolio::position(const std::string& symbol) const {
  auto it = positions_.find(symbol);
  return it == positions_.end() ? nullptr : &it->second;
}

void Portfolio::applyBuy(const std::string& symbol, double qty, double price, double fee,
                         const std::string& date, std::size_t index) {
  if (!(qty > 0) || !(price > 0) || fee < 0)
    throw InvalidParameterError("buy requires qty > 0, price > 0 and fee >= 0");
  if (hasPosition(symbol)) throw EngineError("INTERNAL", "position already open for " + symbol);
  const Money cost(qty * price + fee);
  if (cost.value() > cash_.value() + 1e-9) {
    std::ostringstream os;
    os << "insufficient funds: need " << cost << " but cash is " << cash_;
    throw InsufficientFundsError(os.str());
  }
  cash_ -= cost;
  positions_.emplace(symbol, Position(symbol, qty, price, fee, date, index));
}

Trade Portfolio::applySell(const std::string& symbol, double price, double fee,
                           const std::string& date, std::size_t index, const std::string& reason) {
  auto it = positions_.find(symbol);
  if (it == positions_.end()) throw EngineError("INTERNAL", "no open position for " + symbol);
  const Position& p = it->second;
  Trade t;
  t.id = nextTradeId_++;
  t.symbol = symbol;
  t.status = "closed";
  t.entryDate = p.entryDate();
  t.exitDate = date;
  t.entryIndex = p.entryIndex();
  t.exitIndex = index;
  t.entryPrice = p.entryPrice();
  t.exitPrice = price;
  t.quantity = p.quantity();
  t.entryFee = p.entryFee();
  t.exitFee = fee;
  t.grossPnl = (price - p.entryPrice()) * p.quantity();
  t.netPnl = t.grossPnl - t.entryFee - t.exitFee;
  const double invested = p.entryPrice() * p.quantity() + p.entryFee();
  t.returnPct = invested > 0 ? t.netPnl / invested * 100.0 : 0.0;
  t.holdingDays = daysBetween(t.entryDate, t.exitDate);
  t.exitReason = reason;
  cash_ += Money(p.quantity() * price - fee);
  positions_.erase(it);
  closed_.push_back(t);
  return t;
}

Money Portfolio::equity(const std::map<std::string, double>& marks) const {
  Money total = cash_;
  for (const auto& kv : positions_) {
    auto m = marks.find(kv.first);
    if (m == marks.end()) throw EngineError("INTERNAL", "missing mark price for " + kv.first);
    total += Money(kv.second.marketValue(m->second));
  }
  return total;
}

double Portfolio::realizedPnl() const {
  return std::accumulate(closed_.begin(), closed_.end(), 0.0,
                         [](double s, const Trade& t) { return s + t.netPnl; });
}

std::ostream& operator<<(std::ostream& os, const Portfolio& p) {
  os << "Portfolio{cash=" << p.cash_ << ", positions=" << p.positions_.size()
     << ", closedTrades=" << p.closed_.size() << "}";
  return os;
}

}  // namespace pbe
