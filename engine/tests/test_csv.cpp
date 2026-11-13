#include <gtest/gtest.h>

#include <fstream>

#include "pbe/data/csv_loader.hpp"
#include "pbe/io/json_io.hpp"
#include "test_util.hpp"

using namespace pbe;
using namespace testutil;
using json = nlohmann::json;

TEST(Csv, ParsesValidFileAndIgnoresExtraColumns) {
  const std::string csv = "Date,Open,High,Low,Close,Adj Close,Volume\n"
                          "2024-01-01,10,11,9,10.5,10.5,1000\n"
                          "2024-01-02 00:00:00+05:30,10.5,12,10,11,11,2000\n";
  auto v = CsvCandleLoader::parse(csv);
  ASSERT_EQ(v.size(), 2u);
  EXPECT_EQ(v[1].date, "2024-01-02");
  EXPECT_DOUBLE_EQ(v[1].volume, 2000);
  EXPECT_NO_THROW(CandleSeries{v});
}
TEST(Csv, RejectsMissingColumnsBadNumbersAndEmptyCells) {
  EXPECT_THROW(CsvCandleLoader::parse("Date,Open,High,Low,Close\n2024-01-01,1,2,1,1\n"), DataValidationError);
  EXPECT_THROW(CsvCandleLoader::parse("Date,Open,High,Low,Close,Volume\n2024-01-01,abc,2,1,1,5\n"), DataValidationError);
  auto v = CsvCandleLoader::parse("Date,Open,High,Low,Close,Volume\n2024-01-01,,2,1,1,5\n");
  EXPECT_THROW(CandleSeries{v}, DataValidationError);  // empty cell becomes NaN -> rejected
  EXPECT_THROW(CsvCandleLoader::load("/definitely/not/here.csv"), IoError);
}
TEST(Csv, LoadsFromDisk) {
  const std::string path = "pbe_test_candles.csv";
  { std::ofstream f(path); f << "date,open,high,low,close,volume\n2024-01-01,1,2,1,2,10\n2024-01-02,2,3,2,3,10\n"; }
  auto v = CsvCandleLoader::load(path);
  EXPECT_EQ(v.size(), 2u);
  std::remove(path.c_str());
}

