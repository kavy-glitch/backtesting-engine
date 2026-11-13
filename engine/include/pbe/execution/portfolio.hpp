// portfolio.hpp - cash + positions + closed-trade ledger. Encapsulation: all state is private
// and can only change through applyBuy/applySell, which enforce the accounting rules.
#pragma once
#include <map>
#include <ostream>
#include <string>
#include <vector>

#include "pbe/core/money.hpp"
#include "pbe/core/types.hpp"

namespace pbe {

class Position {
 public:
  Position(std::string symbol, double qty, double entryPrice, double entryFee, std::string date,
           std::size_t index)
      : symbol_(std::move(symbol)), quantity_(qty), entryPrice_(entryPrice), entryFee_(entryFee),
        entryDate_(std::move(date)), entryIndex_(index) {}

  const std::string& symbol() const { return symbol_; }
  double quantity() const { return quantity_; }
  double entryPrice() const { return entryPrice_; }
  double entryFee() const { return entryFee_; }
  const std::string& entryDate() const { return entryDate_; }
  std::size_t entryIndex() const { return entryIndex_; }

  double marketValue(double price) const { return quantity_ * price; }
  // Net of the entry fee; the exit fee is not known until the position is closed.
  double unrealizedPnl(double price) const { return (price - entryPrice_) * quantity_ - entryFee_; }

 private:
  std::string symbol_;
  double quantity_;
  double entryPrice_;
  double entryFee_;
  std::string entryDate_;
  std::size_t entryIndex_;
};

class Portfolio {
 public:
  explicit Portfolio(Money initialCash) : initial_(initialCash), cash_(initialCash) {}

  Money cash() const { return cash_; }
  Money initialCash() const { return initial_; }
  bool hasPosition(const std::string& symbol) const { return positions_.count(symbol) > 0; }
  const Position* position(const std::string& symbol) const;

  // Throws InsufficientFundsError if qty*price + fee exceeds cash (no leverage).
  void applyBuy(const std::string& symbol, double qty, double price, double fee,
                const std::string& date, std::size_t index);
  // Closes the whole position and returns the completed Trade.
  Trade applySell(const std::string& symbol, double price, double fee, const std::string& date,
                  std::size_t index, const std::string& reason);

  // cash + market value of every position (marks: symbol -> price)
  Money equity(const std::map<std::string, double>& marks) const;
  double realizedPnl() const;
  const std::vector<Trade>& closedTrades() const { return closed_; }

  friend std::ostream& operator<<(std::ostream& os, const Portfolio& p);

 private:
  Money initial_;
  Money cash_;
  std::map<std::string, Position> positions_;
  std::vector<Trade> closed_;
  int nextTradeId_ = 1;
};

}  // namespace pbe
