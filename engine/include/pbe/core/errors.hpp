// errors.hpp - exception hierarchy for the engine (OOP: inheritance + exception handling)
#pragma once
#include <stdexcept>
#include <string>
#include <utility>

namespace pbe {

// Base class: carries a machine-readable code so the API layer can map it to an HTTP status.
class EngineError : public std::runtime_error {
 public:
  EngineError(std::string code, const std::string& message)
      : std::runtime_error(message), code_(std::move(code)) {}
  const std::string& code() const noexcept { return code_; }

 private:
  std::string code_;
};

class DataValidationError : public EngineError {
 public:
  explicit DataValidationError(const std::string& m) : EngineError("DATA_VALIDATION", m) {}
};
class InvalidParameterError : public EngineError {
 public:
  explicit InvalidParameterError(const std::string& m) : EngineError("INVALID_PARAMETER", m) {}
};
class InsufficientDataError : public EngineError {
 public:
  explicit InsufficientDataError(const std::string& m) : EngineError("INSUFFICIENT_DATA", m) {}
};
class InsufficientFundsError : public EngineError {
 public:
  explicit InsufficientFundsError(const std::string& m) : EngineError("INSUFFICIENT_FUNDS", m) {}
};
class ParseError : public EngineError {
 public:
  explicit ParseError(const std::string& m) : EngineError("PARSE_ERROR", m) {}
};
class IoError : public EngineError {
 public:
  explicit IoError(const std::string& m) : EngineError("IO_ERROR", m) {}
};

}  // namespace pbe
