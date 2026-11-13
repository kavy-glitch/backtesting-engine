// engine CLI
//   engine                       read a JSON request from stdin, write a JSON response to stdout
//   engine --input request.json  read the request from a file
//   engine --list-strategies     print the strategy catalogue as JSON
//   engine --version
#include <fstream>
#include <iostream>
#include <iterator>
#include <string>

#include "pbe/io/json_io.hpp"

int main(int argc, char** argv) {
  using nlohmann::json;
  std::ios::sync_with_stdio(false);
  std::string inputPath;
  for (int i = 1; i < argc; ++i) {
    const std::string a = argv[i];
    if (a == "--version") { std::cout << pbe::kEngineVersion << "\n"; return 0; }
    if (a == "--list-strategies") { std::cout << pbe::strategyCatalogJson().dump() << "\n"; return 0; }
    if (a == "--input" && i + 1 < argc) { inputPath = argv[++i]; continue; }
    std::cerr << "unknown argument: " << a << "\n";
    return 2;
  }
  std::string text;
  if (inputPath.empty()) {
    text.assign(std::istreambuf_iterator<char>(std::cin), std::istreambuf_iterator<char>());
  } else {
    std::ifstream f(inputPath, std::ios::binary);
    if (!f) { std::cout << json{{"ok", false}, {"error", {{"code", "IO_ERROR"}, {"message", "cannot open " + inputPath}}}}.dump() << "\n"; return 0; }
    text.assign(std::istreambuf_iterator<char>(f), std::istreambuf_iterator<char>());
  }
  json req = json::parse(text, nullptr, false);
  if (req.is_discarded()) {
    std::cout << json{{"ok", false}, {"error", {{"code", "PARSE_ERROR"}, {"message", "request is not valid JSON"}}}}.dump() << "\n";
    return 0;
  }
  std::cout << pbe::handleRequest(req).dump() << "\n";
  return 0;
}
