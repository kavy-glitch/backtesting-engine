#include "pbe/core/date_util.hpp"

#include <cctype>

#include "pbe/core/errors.hpp"

namespace pbe {

bool parseIsoDate(const std::string& s, int& y, int& m, int& d) {
  if (s.size() != 10 || s[4] != '-' || s[7] != '-') return false;
  for (size_t i = 0; i < s.size(); ++i) {
    if (i == 4 || i == 7) continue;
    if (!std::isdigit(static_cast<unsigned char>(s[i]))) return false;
  }
  y = std::stoi(s.substr(0, 4));
  m = std::stoi(s.substr(5, 2));
  d = std::stoi(s.substr(8, 2));
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

long daysFromCivil(int y, int m, int d) {
  y -= m <= 2;
  const long era = (y >= 0 ? y : y - 399) / 400;
  const unsigned yoe = static_cast<unsigned>(y - era * 400);
  const unsigned doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097 + static_cast<long>(doe) - 719468;
}

long daysBetween(const std::string& a, const std::string& b) {
  int y1, m1, d1, y2, m2, d2;
  if (!parseIsoDate(a, y1, m1, d1)) throw DataValidationError("invalid date: " + a);
  if (!parseIsoDate(b, y2, m2, d2)) throw DataValidationError("invalid date: " + b);
  return daysFromCivil(y2, m2, d2) - daysFromCivil(y1, m1, d1);
}

}  // namespace pbe
