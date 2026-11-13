#include "pbe/execution/metrics.hpp"

#include <algorithm>
#include <cmath>
#include <numeric>

#include "pbe/core/date_util.hpp"

namespace pbe {

namespace {
double mean(const std::vector<double>& v) {
  return std::accumulate(v.begin(), v.end(), 0.0) / static_cast<double>(v.size());
}
double sampleStd(const std::vector<double>& v) {
  if (v.size() < 2) return 0.0;
  const double m = mean(v);
  double ss = 0;
  for (double x : v) ss += (x - m) * (x - m);
  return std::sqrt(ss / static_cast<double>(v.size() - 1));
}
}  // namespace

double MetricsCalculator::maxDrawdownPct(const std::vector<double>& equity) {
  double peak = 0, worst = 0;
  for (double e : equity) {
    peak = std::max(peak, e);
    if (peak > 0) worst = std::max(worst, (peak - e) / peak * 100.0);
  }
  return worst;
}

std::vector<double> MetricsCalculator::simpleReturns(const std::vector<double>& equity) {
  std::vector<double> r;
  for (std::size_t i = 1; i < equity.size(); ++i)
    r.push_back(equity[i - 1] > 0 ? equity[i] / equity[i - 1] - 1.0 : 0.0);
  return r;
}

Metrics MetricsCalculator::compute(double initialCapital, const std::vector<EquityPoint>& eq,
                                   const std::vector<Trade>& closed, const Trade* openTrade,
                                   double riskFreeRate, double exposureBars, double buyHoldFinal) {
  Metrics m;
  m.initialCapital = initialCapital;
  m.finalEquity = eq.empty() ? initialCapital : eq.back().equity;
  m.netProfit = m.finalEquity - initialCapital;
  m.totalReturnPct = initialCapital > 0 ? m.netProfit / initialCapital * 100.0 : 0.0;
  m.buyHoldFinalEquity = buyHoldFinal;
  m.buyHoldReturnPct = initialCapital > 0 ? (buyHoldFinal / initialCapital - 1.0) * 100.0 : 0.0;

  std::vector<double> series;
  for (const auto& p : eq) series.push_back(p.equity);
  m.maxDrawdownPct = maxDrawdownPct(series);
  m.exposurePct = eq.empty() ? 0.0 : exposureBars / static_cast<double>(eq.size()) * 100.0;

  // ---- trades ----
  m.closedTrades = static_cast<int>(closed.size());
  std::vector<double> wins, losses, rets;
  double grossWin = 0, grossLoss = 0;
  for (const auto& t : closed) {
    m.realizedPnl += t.netPnl;
    m.totalFees += t.entryFee + t.exitFee;
    rets.push_back(t.returnPct);
    if (t.netPnl > 0) { ++m.winningTrades; wins.push_back(t.netPnl); grossWin += t.netPnl; }
    else if (t.netPnl < 0) { ++m.losingTrades; losses.push_back(t.netPnl); grossLoss += -t.netPnl; }
    else ++m.breakevenTrades;
  }
  if (openTrade) {
    m.unrealizedPnl = openTrade->netPnl;
    m.totalFees += openTrade->entryFee;
  }
  if (!closed.empty()) {
    m.winRatePct = m.winningTrades * 100.0 / static_cast<double>(closed.size());
    m.avgTradeReturnPct = mean(rets);
  } else {
    m.notes["win_rate_pct"] = "no closed trades";
    m.notes["avg_trade_return_pct"] = "no closed trades";
  }
  if (!wins.empty()) m.avgWin = mean(wins); else m.notes["avg_win"] = "no winning trades";
  if (!losses.empty()) m.avgLoss = mean(losses); else m.notes["avg_loss"] = "no losing trades";
  if (grossLoss > 0) m.profitFactor = grossWin / grossLoss;
  else m.notes["profit_factor"] = closed.empty() ? "no closed trades" : "no losing trades (ratio undefined)";

  // ---- time-series statistics ----
  const std::vector<double> r = simpleReturns(series);
  const double rfDaily = riskFreeRate / kTradingDays;
  if (r.size() >= 2) {
    const double sd = sampleStd(r);
    m.annualVolatilityPct = sd * std::sqrt(kTradingDays) * 100.0;
    if (sd > 0) {
      std::vector<double> ex;
      for (double x : r) ex.push_back(x - rfDaily);
      m.sharpe = mean(ex) / sd * std::sqrt(kTradingDays);
    } else {
      m.notes["sharpe_ratio"] = "zero volatility (no variation in daily returns)";
    }
    double dd = 0;
    for (double x : r) { const double d = std::min(x - rfDaily, 0.0); dd += d * d; }
    dd = std::sqrt(dd / static_cast<double>(r.size()));
    if (dd > 0) {
      std::vector<double> ex;
      for (double x : r) ex.push_back(x - rfDaily);
      m.sortino = mean(ex) / dd * std::sqrt(kTradingDays);
    } else {
      m.notes["sortino_ratio"] = "no downside returns (downside deviation is zero)";
    }
    if (r.size() < 30) {
      m.notes["sample_size"] = "fewer than 30 daily returns: risk metrics are statistically weak";
    }
  } else {
    m.notes["sharpe_ratio"] = "insufficient observations (need at least 2 daily returns)";
    m.notes["sortino_ratio"] = "insufficient observations (need at least 2 daily returns)";
    m.notes["annual_volatility_pct"] = "insufficient observations";
  }

  if (eq.size() >= 2) {
    const long days = daysBetween(eq.front().date, eq.back().date);
    if (days >= 30 && m.finalEquity > 0 && initialCapital > 0) {
      const double years = static_cast<double>(days) / 365.25;
      m.cagrPct = (std::pow(m.finalEquity / initialCapital, 1.0 / years) - 1.0) * 100.0;
    } else {
      m.notes["cagr_pct"] = "period shorter than 30 days or non-positive final equity";
    }
  }
  return m;
}

}  // namespace pbe
