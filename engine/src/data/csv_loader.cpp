#include "pbe/data/csv_loader.hpp"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdlib>
#include <fstream>
#include <limits>
#include <map>
#include <sstream>

#include "pbe/core/errors.hpp"

namespace pbe {

namespace {
std::string trim(const std::string& s) {
  std::size_t a = 0, b = s.size();
  while (a < b && std::isspace(static_cast<unsigned char>(s[a]))) ++a;
  while (b > a && std::isspace(static_cast<unsigned char>(s[b - 1]))) --b;
  return s.substr(a, b - a);
}
std::string lower(std::string s) {
  std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) { return std::tolower(c); });
  return s;
}
std::vector<std::string> splitLine(const std::string& line) {
  std::vector<std::string> out;
  std::string cur;
  std::istringstream ss(line);
  while (std::getline(ss, cur, ',')) out.push_back(trim(cur));
  if (!line.empty() && line.back() == ',') out.push_back("");
  return out;
}
double toNumber(const std::string& s, std::size_t row, const std::string& col) {
  if (s.empty() || lower(s) == "nan" || lower(s) == "null") return std::numeric_limits<double>::quiet_NaN();
  char* end = nullptr;
  const double v = std::strtod(s.c_str(), &end);
  if (end == s.c_str() || *end != '\0')
    throw DataValidationError("row " + std::to_string(row) + ": column " + col + " is not a number: '" + s + "'");
  return v;
}
}  // namespace

std::vector<Candle> CsvCandleLoader::load(const std::string& path) {
  std::ifstream f(path, std::ios::binary);
  if (!f) throw IoError("cannot open CSV file: " + path);
  std::ostringstream buf;
  buf << f.rdbuf();
  return parse(buf.str());
}

std::vector<Candle> CsvCandleLoader::parse(const std::string& textIn) {
  std::string text = textIn;
  if (text.size() >= 3 && static_cast<unsigned char>(text[0]) == 0xEF) text = text.substr(3);  // BOM
  std::istringstream in(text);
  std::string line;
  if (!std::getline(in, line)) throw DataValidationError("CSV is empty");
  std::map<std::string, std::size_t> col;
  const auto header = splitLine(line);
  for (std::size_t i = 0; i < header.size(); ++i) col[lower(header[i])] = i;
  for (const char* req : {"date", "open", "high", "low", "close", "volume"})
    if (!col.count(req)) throw DataValidationError(std::string("CSV is missing required column '") + req + "'");

  std::vector<Candle> out;
  std::size_t row = 1;
  while (std::getline(in, line)) {
    ++row;
    if (trim(line).empty()) continue;
    const auto cells = splitLine(line);
    if (cells.size() < header.size())
      throw DataValidationError("row " + std::to_string(row) + ": expected " + std::to_string(header.size()) + " columns");
    Candle c;
    c.date = cells[col["date"]];
    if (c.date.size() > 10 && (c.date[10] == ' ' || c.date[10] == 'T')) c.date = c.date.substr(0, 10);
    c.open = toNumber(cells[col["open"]], row, "open");
    c.high = toNumber(cells[col["high"]], row, "high");
    c.low = toNumber(cells[col["low"]], row, "low");
    c.close = toNumber(cells[col["close"]], row, "close");
    c.volume = toNumber(cells[col["volume"]], row, "volume");
    out.push_back(c);
  }
  return out;
}

}  // namespace pbe
