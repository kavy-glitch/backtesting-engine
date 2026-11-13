#include <gtest/gtest.h>

#include <fstream>

#include "pbe/data/csv_loader.hpp"
#include "pbe/io/json_io.hpp"
#include "test_util.hpp"

using namespace pbe;
using namespace testutil;
using json = nlohmann::json;

static json candlesJson(const std::vector<Candle>& cs) {
  json a = json::array();
  for (const auto& c : cs)
    a.push_back({{"date", c.date}, {"open", c.open}, {"high", c.high}, {"low", c.low}, {"close", c.close}, {"volume", c.volume}});
  return a;
}

TEST(JsonApi, SuccessfulRunHasExpectedShape) {
  json req = {{"candles", candlesJson(randomWalk(120))},
              {"strategy", {{"type", "sma_crossover"}, {"params", {{"fast", 5}, {"slow", 20}}}}},
              {"config", {{"initial_capital", 50000}, {"fee_pct", 0.1}, {"slippage_bps", 5},
                          {"position_sizing", {{"mode", "percent_equity"}, {"value", 100}}}}}};
  json out = handleRequest(req);
  ASSERT_TRUE(out["ok"].get<bool>()) << out.dump();
  const json& r = out["result"];
  EXPECT_EQ(r["equity"].size(), 120u);
  EXPECT_EQ(r["benchmark"].size(), 120u);
  EXPECT_EQ(r["indicators"].size(), 2u);
  EXPECT_TRUE(r["metrics"].contains("sharpe_ratio"));
  EXPECT_TRUE(r["metrics"]["notes"].is_object());
  // the JSON must never contain NaN/inf: dump() would have produced "null" for them
  EXPECT_EQ(out.dump().find("nan"), std::string::npos);
  EXPECT_EQ(out.dump().find("inf"), std::string::npos);
}
TEST(JsonApi, ErrorsAreStructuredNeverThrown) {
  json bad = candlesJson(randomWalk(40));
  bad[3]["high"] = 1.0;  // invalid OHLC
  json out = handleRequest({{"candles", bad}, {"strategy", {{"type", "buy_and_hold"}}}});
  EXPECT_FALSE(out["ok"].get<bool>());
  EXPECT_EQ(out["error"]["code"], "DATA_VALIDATION");

  out = handleRequest({{"candles", candlesJson(randomWalk(40))}, {"strategy", {{"type", "unknown"}}}});
  EXPECT_EQ(out["error"]["code"], "INVALID_PARAMETER");

  out = handleRequest({{"strategy", {{"type", "buy_and_hold"}}}});
  EXPECT_EQ(out["error"]["code"], "PARSE_ERROR");

  out = handleRequest(json::array());
  EXPECT_EQ(out["error"]["code"], "PARSE_ERROR");

  out = handleRequest({{"candles", candlesJson(randomWalk(10))}, {"strategy", {{"type", "sma_crossover"}, {"params", {{"fast", 5}, {"slow", 50}}}}}});
  EXPECT_EQ(out["error"]["code"], "INSUFFICIENT_DATA");

  json nullClose = candlesJson(randomWalk(40));
  nullClose[5]["close"] = nullptr;
  out = handleRequest({{"candles", nullClose}, {"strategy", {{"type", "buy_and_hold"}}}});
  EXPECT_EQ(out["error"]["code"], "DATA_VALIDATION");

  out = handleRequest({{"candles", candlesJson(randomWalk(40))}, {"strategy", {{"type", "buy_and_hold"}}},
                       {"config", {{"initial_capital", "lots"}}}});
  EXPECT_EQ(out["error"]["code"], "PARSE_ERROR");
}
TEST(JsonApi, CatalogListsAllStrategiesWithParamSpecs) {
  json c = strategyCatalogJson();
  EXPECT_EQ(c.size(), 5u);
  for (const auto& s : c) {
    EXPECT_TRUE(s.contains("type"));
    EXPECT_TRUE(s["params"].is_array());
  }
}

TEST(JsonApi, ValidateOnlyChecksParametersWithoutCandles) {
  json ok = handleRequest({{"validate_only", true}, {"strategy", {{"type", "sma_crossover"}, {"params", {{"fast", 5}, {"slow", 20}}}}}});
  EXPECT_TRUE(ok["ok"].get<bool>());
  json bad = handleRequest({{"validate_only", true}, {"strategy", {{"type", "sma_crossover"}, {"params", {{"fast", 50}, {"slow", 20}}}}}});
  EXPECT_FALSE(bad["ok"].get<bool>());
  EXPECT_EQ(bad["error"]["code"], "INVALID_PARAMETER");
}
