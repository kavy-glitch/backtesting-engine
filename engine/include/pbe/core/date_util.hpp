// date_util.hpp - strict ISO date helpers (YYYY-MM-DD), no time zones.
#pragma once
#include <string>

namespace pbe {

inline bool isLeapYear(int y) { return (y % 4 == 0 && y % 100 != 0) || y % 400 == 0; }
inline int daysInMonth(int y, int m) {
  static const int d[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
  return (m == 2 && isLeapYear(y)) ? 29 : d[m - 1];
}

// Returns true only for a real calendar date written exactly as YYYY-MM-DD.
bool parseIsoDate(const std::string& s, int& y, int& m, int& d);
// Days since 1970-01-01 (Howard Hinnant's algorithm).
long daysFromCivil(int y, int m, int d);
// (b - a) in days. Throws DataValidationError when either date is invalid.
long daysBetween(const std::string& a, const std::string& b);

}  // namespace pbe
