// money.hpp - a small value type with operator overloading and a friend function.
#pragma once
#include <ostream>

namespace pbe {

class Money {
 public:
  constexpr Money() = default;
  explicit constexpr Money(double v) : v_(v) {}

  constexpr double value() const { return v_; }  // implicitly inline, const member function

  Money operator+(const Money& o) const { return Money(v_ + o.v_); }
  Money operator-(const Money& o) const { return Money(v_ - o.v_); }
  Money operator*(double k) const { return Money(v_ * k); }
  Money operator-() const { return Money(-v_); }
  Money& operator+=(const Money& o) { v_ += o.v_; return *this; }
  Money& operator-=(const Money& o) { v_ -= o.v_; return *this; }

  bool operator<(const Money& o) const { return v_ < o.v_; }
  bool operator>(const Money& o) const { return v_ > o.v_; }
  bool operator<=(const Money& o) const { return v_ <= o.v_; }
  bool operator>=(const Money& o) const { return v_ >= o.v_; }
  bool operator==(const Money& o) const { return v_ == o.v_; }

  // Friend functions: non-members that may touch private state.
  friend Money operator*(double k, const Money& m) { return Money(k * m.v_); }
  friend std::ostream& operator<<(std::ostream& os, const Money& m) {
    return os << m.v_;
  }

 private:
  double v_ = 0.0;
};

}  // namespace pbe
