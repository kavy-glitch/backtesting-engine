#include "pbe/execution/backtester.hpp"

#include <algorithm>
#include <cmath>
#include <sstream>

#include "pbe/execution/broker.hpp"
#include "pbe/core/containers.hpp"
#include "pbe/core/date_util.hpp"
#include "pbe/core/errors.hpp"
#include "pbe/execution/portfolio.hpp"

namespace pbe {

void BacktestConfig::validate() const {
  auto bad = [](const std::string& m) { throw InvalidParameterError(m); };
  if (!std::isfinite(initialCapital) || initialCapital <= 0) bad("initial_capital must be greater than 0");
  if (!std::isfinite(costs.feePct) || costs.feePct < 0 || costs.feePct >= 100) bad("fee_pct must be in [0, 100)");
  if (!std::isfinite(costs.feeFlat) || costs.feeFlat < 0) bad("fee_flat must be >= 0");
  if (!std::isfinite(costs.slippageBps) || costs.slippageBps < 0 || costs.slippageBps > 2000)
    bad("slippage_bps must be in [0, 2000]");
  if (sizingMode == SizingMode::PercentEquity) {
    if (!(sizingValue > 0 && sizingValue <= 100)) bad("position size percent must be in (0, 100]");
  } else if (!(sizingValue > 0) || !std::isfinite(sizingValue)) {
    bad("fixed quantity must be greater than 0");
  }
  if (stopLossPct && !(*stopLossPct > 0 && *stopLossPct < 100)) bad("stop_loss_pct must be in (0, 100)");
  if (takeProfitPct && !(*takeProfitPct > 0 && *takeProfitPct <= 1000)) bad("take_profit_pct must be in (0, 1000]");
  if (!std::isfinite(riskFreeRate) || riskFreeRate < 0 || riskFreeRate >= 1) bad("risk_free_rate must be in [0, 1)");
  if (symbol.empty()) bad("symbol must not be empty");
}

std::vector<EquityPoint> Backtester::buyAndHoldBenchmark(const CandleSeries& candles) const {
  Broker broker(cfg_.costs);
  const double fill = broker.buyFill(candles[0].open);
  const double qty = broker.affordableQuantity(cfg_.initialCapital, fill, cfg_.allowFractional);
  const double cash = cfg_.initialCapital - (qty > 0 ? qty * fill + broker.fee(qty * fill) : 0.0);
  std::vector<EquityPoint> out;
  double peak = 0;
  for (const Candle& c : candles) {
    EquityPoint p;
    p.date = c.date;
    p.cash = cash;
    p.positionValue = qty * c.close;
    p.equity = cash + p.positionValue;
    peak = std::max(peak, p.equity);
    p.drawdownPct = (p.equity / peak - 1.0) * 100.0;
    out.push_back(p);
  }
  return out;
}

BacktestResult Backtester::run(const CandleSeries& candles, Strategy& strategy) const {
  cfg_.validate();
  const std::size_t n = candles.size();
  if (n < strategy.minimumCandles()) {
    std::ostringstream os;
    os << strategy.displayName() << " needs at least " << strategy.minimumCandles()
       << " candles with these parameters, but only " << n << " were supplied";
    throw InsufficientDataError(os.str());
  }
  strategy.prepare(candles);

  const Broker broker(cfg_.costs);
  Portfolio pf{Money(cfg_.initialCapital)};
  const std::string& sym = cfg_.symbol;

  BacktestResult res;
  res.warnings = candles.warnings();
  NumericBuffer eqBuf(n);
  std::vector<EquityPoint> eqPoints;
  eqPoints.reserve(n);
  Signal pending = Signal::Hold;
  double peak = 0, exposureBars = 0;

  for (std::size_t i = 0; i < n; ++i) {
    const Candle& c = candles[i];

    // 1. execute the order generated at the previous close, at this bar's open
    if (pending == Signal::Buy && !pf.hasPosition(sym)) {
      const double fill = broker.buyFill(c.open);
      double qty = 0;
      std::string why;
      if (cfg_.sizingMode == SizingMode::PercentEquity) {
        const double budget = pf.cash().value() * cfg_.sizingValue / 100.0;
        qty = broker.affordableQuantity(budget, fill, cfg_.allowFractional);
        if (qty <= 0) {
          std::ostringstream os;
          os << "insufficient funds: budget " << budget << " cannot buy one unit at " << fill;
          why = os.str();
        }
      } else {
        qty = cfg_.allowFractional ? cfg_.sizingValue : std::floor(cfg_.sizingValue);
        const double cost = qty * fill + broker.fee(qty * fill);
        if (qty <= 0 || cost > pf.cash().value() + 1e-9) {
          std::ostringstream os;
          os << "insufficient funds: order costs " << cost << " but cash is " << pf.cash();
          why = os.str();
          qty = 0;
        }
      }
      if (qty > 0) pf.applyBuy(sym, qty, fill, broker.fee(qty * fill), c.date, i);
      else res.rejected.push_back({c.date, "BUY", why});
    } else if (pending == Signal::Sell && pf.hasPosition(sym)) {
      const double fill = broker.sellFill(c.open);
      const Position* p = pf.position(sym);
      res.trades.push_back(pf.applySell(sym, fill, broker.fee(p->quantity() * fill), c.date, i, "signal"));
    }
    pending = Signal::Hold;

    // 2. protective exits inside this bar
    if (pf.hasPosition(sym) && (cfg_.stopLossPct || cfg_.takeProfitPct)) {
      const Position* p = pf.position(sym);
      const double stop = cfg_.stopLossPct ? p->entryPrice() * (1.0 - *cfg_.stopLossPct / 100.0) : 0.0;
      const double target = cfg_.takeProfitPct ? p->entryPrice() * (1.0 + *cfg_.takeProfitPct / 100.0) : 0.0;
      double raw = 0;
      const char* reason = nullptr;
      if (cfg_.stopLossPct && c.open <= stop) { raw = c.open; reason = "stop_loss"; }
      else if (cfg_.takeProfitPct && c.open >= target) { raw = c.open; reason = "take_profit"; }
      else if (cfg_.stopLossPct && c.low <= stop) { raw = stop; reason = "stop_loss"; }
      else if (cfg_.takeProfitPct && c.high >= target) { raw = target; reason = "take_profit"; }
      if (reason) {
        const double fill = broker.sellFill(raw);
        res.trades.push_back(pf.applySell(sym, fill, broker.fee(p->quantity() * fill), c.date, i, reason));
      }
    }

    // 3. mark to market at the close
    const Money equity = pf.equity({{sym, c.close}});
    EquityPoint ep;
    ep.date = c.date;
    ep.equity = equity.value();
    ep.cash = pf.cash().value();
    ep.positionValue = ep.equity - ep.cash;
    peak = std::max(peak, ep.equity);
    ep.drawdownPct = (ep.equity / peak - 1.0) * 100.0;
    eqBuf.push_back(ep.equity);
    eqPoints.push_back(ep);
    if (pf.hasPosition(sym)) exposureBars += 1;

    // 4. signal for the NEXT bar, using information up to this close only
    if (i + 1 < n) pending = strategy.signalAt(i);
  }

  res.equity = std::move(eqPoints);
  if (pf.hasPosition(sym)) {
    const Position* p = pf.position(sym);
    const Candle& last = candles[n - 1];
    Trade t;
    t.id = static_cast<int>(res.trades.size()) + 1;
    t.symbol = sym;
    t.status = "open";
    t.entryDate = p->entryDate();
    t.exitDate = last.date;
    t.entryIndex = p->entryIndex();
    t.exitIndex = n - 1;
    t.entryPrice = p->entryPrice();
    t.exitPrice = last.close;
    t.quantity = p->quantity();
    t.entryFee = p->entryFee();
    t.exitFee = 0;
    t.grossPnl = (last.close - p->entryPrice()) * p->quantity();
    t.netPnl = p->unrealizedPnl(last.close);
    t.returnPct = t.netPnl / (p->entryPrice() * p->quantity() + p->entryFee()) * 100.0;
    t.holdingDays = daysBetween(t.entryDate, t.exitDate);
    t.exitReason = "open";
    res.openTrade = t;
  }
  res.benchmark = buyAndHoldBenchmark(candles);
  res.indicators = strategy.indicators();
  res.metrics = MetricsCalculator::compute(cfg_.initialCapital, res.equity, res.trades,
                                           res.openTrade ? &*res.openTrade : nullptr,
                                           cfg_.riskFreeRate, exposureBars,
                                           res.benchmark.back().equity);
  return res;
}

}  // namespace pbe
