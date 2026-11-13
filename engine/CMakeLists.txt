cmake_minimum_required(VERSION 3.16)
project(pbe_engine VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release)
endif()

option(PBE_BUILD_TESTS "Build unit tests (downloads GoogleTest)" ON)

add_library(pbe_core STATIC
  src/core/date_util.cpp
  src/data/candle_series.cpp src/data/csv_loader.cpp
  src/strategy/indicators.cpp src/strategy/strategy.cpp
  src/execution/portfolio.cpp src/execution/metrics.cpp src/execution/backtester.cpp
  src/io/json_io.cpp)
target_include_directories(pbe_core PUBLIC include third_party)
if(MSVC)
  target_compile_options(pbe_core PUBLIC /W4 /EHsc /bigobj)
else()
  target_compile_options(pbe_core PUBLIC -Wall -Wextra -Wpedantic)
endif()

add_executable(engine src/main.cpp)
target_link_libraries(engine PRIVATE pbe_core)

if(PBE_BUILD_TESTS)
  include(FetchContent)
  set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
  FetchContent_Declare(googletest
    URL https://github.com/google/googletest/archive/refs/tags/v1.14.0.tar.gz)
  FetchContent_MakeAvailable(googletest)
  enable_testing()
  file(GLOB PBE_TEST_SOURCES tests/*.cpp)
  add_executable(engine_tests ${PBE_TEST_SOURCES})
  target_link_libraries(engine_tests PRIVATE pbe_core GTest::gtest_main)
  include(GoogleTest)
  gtest_discover_tests(engine_tests)
endif()
