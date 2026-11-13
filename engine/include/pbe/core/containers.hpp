// containers.hpp
//  * RollingWindow<T>  - a class template (OOP: templates) used by the SMA indicator.
//  * NumericBuffer     - owns a raw heap array; implements the Rule of Five
//                        (OOP: constructors/destructors, copy constructor, assignment
//                        operator, memory management). It stores the equity curve.
#pragma once
#include <algorithm>
#include <cstddef>
#include <numeric>
#include <utility>
#include <vector>

#include "pbe/core/errors.hpp"

namespace pbe {

template <typename T>
class RollingWindow {
 public:
  explicit RollingWindow(std::size_t capacity) : capacity_(capacity) {
    if (capacity == 0) throw InvalidParameterError("window size must be >= 1");
    buf_.reserve(capacity);
  }
  void push(const T& v) {
    if (buf_.size() < capacity_) {
      buf_.push_back(v);
    } else {
      buf_[head_] = v;
      head_ = (head_ + 1) % capacity_;
    }
  }
  bool full() const { return buf_.size() == capacity_; }
  std::size_t size() const { return buf_.size(); }
  T sum() const { return std::accumulate(buf_.begin(), buf_.end(), T{}); }
  T mean() const { return buf_.empty() ? T{} : sum() / static_cast<T>(buf_.size()); }

 private:
  std::size_t capacity_;
  std::size_t head_ = 0;
  std::vector<T> buf_;
};

class NumericBuffer {
 public:
  NumericBuffer() = default;
  explicit NumericBuffer(std::size_t reserve_hint) { grow(reserve_hint); }

  ~NumericBuffer() { delete[] data_; }  // destructor releases the owned array

  NumericBuffer(const NumericBuffer& o) : size_(o.size_), capacity_(o.size_) {  // copy ctor (deep copy)
    if (capacity_ > 0) {
      data_ = new double[capacity_];
      std::copy(o.data_, o.data_ + size_, data_);
    }
  }
  NumericBuffer& operator=(const NumericBuffer& o) {  // copy assignment
    if (this != &o) {
      NumericBuffer tmp(o);
      swap(tmp);
    }
    return *this;
  }
  NumericBuffer(NumericBuffer&& o) noexcept { swap(o); }  // move ctor
  NumericBuffer& operator=(NumericBuffer&& o) noexcept {  // move assignment
    if (this != &o) {
      delete[] data_;
      data_ = nullptr;
      size_ = capacity_ = 0;
      swap(o);
    }
    return *this;
  }

  void push_back(double v) {
    if (size_ == capacity_) grow(capacity_ == 0 ? 16 : capacity_ * 2);
    data_[size_++] = v;
  }
  double operator[](std::size_t i) const { return data_[i]; }
  double& operator[](std::size_t i) { return data_[i]; }
  std::size_t size() const { return size_; }
  const double* begin() const { return data_; }
  const double* end() const { return data_ + size_; }
  std::vector<double> toVector() const { return std::vector<double>(begin(), end()); }

 private:
  void grow(std::size_t new_cap) {
    double* nd = new double[new_cap];
    if (data_) std::copy(data_, data_ + size_, nd);
    delete[] data_;
    data_ = nd;
    capacity_ = new_cap;
  }
  void swap(NumericBuffer& o) noexcept {
    std::swap(data_, o.data_);
    std::swap(size_, o.size_);
    std::swap(capacity_, o.capacity_);
  }
  double* data_ = nullptr;
  std::size_t size_ = 0;
  std::size_t capacity_ = 0;
};

}  // namespace pbe
