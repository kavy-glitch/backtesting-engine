// json_io.hpp - the engine <-> API contract (JSON in, JSON out). See docs/engine.md.
#pragma once
#include <nlohmann/json.hpp>

namespace pbe {

constexpr const char* kEngineVersion = "1.0.0";

// Never throws: failures are reported as {"ok": false, "error": {"code", "message"}}.
nlohmann::json handleRequest(const nlohmann::json& request);
nlohmann::json strategyCatalogJson();

}  // namespace pbe
