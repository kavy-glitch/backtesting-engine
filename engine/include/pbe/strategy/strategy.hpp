// strategy.hpp - abstract Strategy + concrete strategies + factory.
// OOP: abstraction (pure virtual interface), inheritance (single, multilevel, protected
// helpers), polymorphism / dynamic binding (Backtester calls Strategy& virtually),
// virtual destructor, static class data (instance counter, registry).
#pragma once
#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

#include "pbe/data/candle_series.hpp"
#include "pbe/core/types.hpp"

namespace pbe {

using ParamMap = std::map<std::string, double>;

struct IndicatorSeries {
  std::string name;
  std::string panel;  // "overlay" (drawn on price), "rsi", or "macd"
  std::vector<double> values;
};

struct ParamSpec {
  std::string key, label;
  double def, min, max;
  bool integer;
};
struct StrategyInfo {
  std::string type, name, description;
  std::vector<ParamSpec> params;
};

class Strategy {
 public:
  Strategy() { ++created_; }
  virtual ~Strategy() = default;  // virtual destructor: safe delete through base pointer

  virtual std::string type() const = 0;
  virtual std::string displayName() const = 0;
  virtual ParamMap params() const = 0;
  // Number of leading bars needed before the first signal can be produced.
  virtual std::size_t warmupBars() const = 0;
  // Pre-compute indicators. Each value only depends on data up to its own index.
  virtual void prepare(const CandleSeries& candles) = 0;
  // Signal using information available at the CLOSE of bar i. The engine executes it on
  // the OPEN of bar i+1.
  virtual Signal signalAt(std::size_t i) const = 0;
  virtual std::vector<IndicatorSeries> indicators() const { return {}; }

  // warmup + one bar to observe a crossing + one bar to execute.
  std::size_t minimumCandles() const { return warmupBars() + 2; }

  static int instancesCreated() { return created_; }  // static class data

 private:
  static int created_;
};

class BuyAndHold : public Strategy {
 public:
  std::string type() const override { return "buy_and_hold"; }
  std::string displayName() const override { return "Buy and Hold"; }
  ParamMap params() const override { return {}; }
  std::size_t warmupBars() const override { return 0; }
  void prepare(const CandleSeries&) override {}
  Signal signalAt(std::size_t i) const override { return i == 0 ? Signal::Buy : Signal::Hold; }
};

// Intermediate abstract class (multilevel inheritance): shared crossover logic.
class CrossoverStrategy : public Strategy {
 protected:
  static Signal crossSignal(const std::vector<double>& fast, const std::vector<double>& slow,
                            std::size_t i);
};

class SmaCrossover : public CrossoverStrategy {
 public:
  SmaCrossover(int fast, int slow);
  std::string type() const override { return "sma_crossover"; }
  std::string displayName() const override { return "SMA Crossover"; }
  ParamMap params() const override { return {{"fast", fast_}, {"slow", slow_}}; }
  std::size_t warmupBars() const override { return static_cast<std::size_t>(slow_); }
  void prepare(const CandleSeries& c) override;
  Signal signalAt(std::size_t i) const override { return crossSignal(fast_v_, slow_v_, i); }
  std::vector<IndicatorSeries> indicators() const override;

 private:
  int fast_, slow_;
  std::vector<double> fast_v_, slow_v_;
};

class EmaCrossover : public CrossoverStrategy {
 public:
  EmaCrossover(int fast, int slow);
  std::string type() const override { return "ema_crossover"; }
  std::string displayName() const override { return "EMA Crossover"; }
  ParamMap params() const override { return {{"fast", fast_}, {"slow", slow_}}; }
  std::size_t warmupBars() const override { return static_cast<std::size_t>(slow_); }
  void prepare(const CandleSeries& c) override;
  Signal signalAt(std::size_t i) const override { return crossSignal(fast_v_, slow_v_, i); }
  std::vector<IndicatorSeries> indicators() const override;

 private:
  int fast_, slow_;
  std::vector<double> fast_v_, slow_v_;
};

class MacdCrossover : public CrossoverStrategy {
 public:
  MacdCrossover(int fast, int slow, int signal);
  std::string type() const override { return "macd_crossover"; }
  std::string displayName() const override { return "MACD Crossover"; }
  ParamMap params() const override { return {{"fast", fast_}, {"slow", slow_}, {"signal", signal_}}; }
  std::size_t warmupBars() const override { return static_cast<std::size_t>(slow_ + signal_ - 1); }
  void prepare(const CandleSeries& c) override;
  Signal signalAt(std::size_t i) const override { return crossSignal(macd_, signal_v_, i); }
  std::vector<IndicatorSeries> indicators() const override;

 private:
  int fast_, slow_, signal_;
  std::vector<double> macd_, signal_v_, hist_;
};

// Buy when RSI drops below `oversold`, sell when it rises above `overbought` (level-based).
class RsiStrategy : public Strategy {
 public:
  RsiStrategy(int period, double oversold, double overbought);
  std::string type() const override { return "rsi_threshold"; }
  std::string displayName() const override { return "RSI Threshold"; }
  ParamMap params() const override {
    return {{"period", period_}, {"oversold", oversold_}, {"overbought", overbought_}};
  }
  std::size_t warmupBars() const override { return static_cast<std::size_t>(period_); }
  void prepare(const CandleSeries& c) override;
  Signal signalAt(std::size_t i) const override;
  std::vector<IndicatorSeries> indicators() const override;

 private:
  int period_;
  double oversold_, overbought_;
  std::vector<double> rsi_;
};

class StrategyFactory {
 public:
  static std::unique_ptr<Strategy> create(const std::string& type, const ParamMap& params);
  static std::vector<StrategyInfo> catalog();

 private:
  struct Entry {
    StrategyInfo info;
    std::function<std::unique_ptr<Strategy>(const ParamMap&)> make;
  };
  static const std::vector<Entry>& registry();  // static registry built once
};

}  // namespace pbe
