#include "pbe/strategy/indicators.hpp"

#include "pbe/core/containers.hpp"

namespace pbe {
namespace indicators {

std::vector<double> sma(const std::vector<double>& v, std::size_t period) {
  std::vector<double> out(v.size(), kNaN);
  RollingWindow<double> w(period);
  for (std::size_t i = 0; i < v.size(); ++i) {
    w.push(v[i]);
    if (w.full()) out[i] = w.mean();
  }
  return out;
}

std::vector<double> ema(const std::vector<double>& v, std::size_t period) {
  std::vector<double> out(v.size(), kNaN);
  if (period == 0) return out;
  std::size_t start = 0;
  while (start < v.size() && std::isnan(v[start])) ++start;
  if (v.size() < start + period) return out;
  double seed = 0;
  for (std::size_t i = start; i < start + period; ++i) seed += v[i];
  seed /= static_cast<double>(period);
  const std::size_t first = start + period - 1;
  out[first] = seed;
  const double alpha = 2.0 / (static_cast<double>(period) + 1.0);
  for (std::size_t i = first + 1; i < v.size(); ++i)
    out[i] = alpha * v[i] + (1.0 - alpha) * out[i - 1];
  return out;
}

static double rsiValue(double avgGain, double avgLoss) {
  if (avgLoss == 0.0) return avgGain == 0.0 ? 50.0 : 100.0;
  return 100.0 - 100.0 / (1.0 + avgGain / avgLoss);
}

std::vector<double> rsi(const std::vector<double>& v, std::size_t period) {
  std::vector<double> out(v.size(), kNaN);
  if (period < 1 || v.size() <= period) return out;
  double gain = 0, loss = 0;
  for (std::size_t i = 1; i <= period; ++i) {
    const double ch = v[i] - v[i - 1];
    if (ch > 0) gain += ch; else loss -= ch;
  }
  double avgGain = gain / static_cast<double>(period);
  double avgLoss = loss / static_cast<double>(period);
  out[period] = rsiValue(avgGain, avgLoss);
  const double p = static_cast<double>(period);
  for (std::size_t i = period + 1; i < v.size(); ++i) {
    const double ch = v[i] - v[i - 1];
    const double g = ch > 0 ? ch : 0.0;
    const double l = ch < 0 ? -ch : 0.0;
    avgGain = (avgGain * (p - 1.0) + g) / p;
    avgLoss = (avgLoss * (p - 1.0) + l) / p;
    out[i] = rsiValue(avgGain, avgLoss);
  }
  return out;
}

MacdResult macd(const std::vector<double>& v, std::size_t fast, std::size_t slow,
                std::size_t signal) {
  MacdResult r;
  const auto ef = ema(v, fast);
  const auto es = ema(v, slow);
  r.macd.assign(v.size(), kNaN);
  for (std::size_t i = 0; i < v.size(); ++i)
    if (!std::isnan(ef[i]) && !std::isnan(es[i])) r.macd[i] = ef[i] - es[i];
  r.signal = ema(r.macd, signal);
  r.histogram.assign(v.size(), kNaN);
  for (std::size_t i = 0; i < v.size(); ++i)
    if (!std::isnan(r.macd[i]) && !std::isnan(r.signal[i])) r.histogram[i] = r.macd[i] - r.signal[i];
  return r;
}

}  // namespace indicators
}  // namespace pbe
