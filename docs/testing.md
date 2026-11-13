# Testing and verification

Everything below was actually executed. Numbers are from the final run in the build environment (Ubuntu 24.04 Linux sandbox, MySQL **8.0.46**, GCC 13, Python 3.12, Node 22).

## Results

| Suite | Tests | Result | How it was run |
|---|---|---|---|
| C++ engine unit tests (GoogleTest 1.14) | 51 | **51 passed** | `engine_tests` built with CMake, Release |
| …same, under AddressSanitizer + UBSan | 51 | **51 passed, 0 sanitizer reports** | Debug build, `-fsanitize=address,undefined` |
| Backend + database + concurrency + engine cross-check (pytest) | 79 | **79 passed** | real MySQL, real compiled engine, no mocks for either |
| Frontend (Vitest + Testing Library, jsdom) | 49 | **49 passed** | charting library replaced by a recorder (jsdom has no canvas) |
| End-to-end smoke test over HTTP (`scripts.smoke_test`) | 15 checks | **all passed** | live uvicorn + MySQL + engine, as the least-privilege DB account |
| TypeScript type-check / production build | – | clean / OK | `tsc --noEmit`, `vite build` |

Breakdown of the 79: API data & import 19 · backtest API 17 · database 20 · concurrency 5 · engine-vs-reference cross-check 18.

### Independent cross-check of the engine

`backend/tests/engine/test_crosscheck.py` contains a separate Python implementation of the execution rules (written without sharing any logic with the C++). For 3 synthetic series × (SMA 10/40, SMA 5/20, EMA 12/26) × (no costs, 0.1 % fee + 5 bps slippage) = 18 cases it asserts that every equity point, every trade (entry/exit bar, net P&L), the open position and the maximum drawdown agree to 1e-9 relative. Passed.

## Requested test list → where it is covered

**Backtesting** (`engine/tests/test_backtest.cpp`, `test_metrics.cpp`, `test_indicators.cpp`)

| # | Required | Test |
|---|---|---|
| 1 | no trades | `NoTradesLeavesCapitalUntouched` |
| 2 | one profitable trade | `OneProfitableTrade` (also proves next-open execution) |
| 3 | one losing trade | `OneLosingTrade` |
| 4 | insufficient capital | `InsufficientCapitalRejectsOrder`, `FixedQuantityBeyondCashIsRejectedNotLeveraged` |
| 5 | transaction fees | `PercentFeesAreChargedOnBothSides`, `FlatFeeReducesAffordableQuantity` |
| 6 | slippage | `SlippageWorksAgainstTheTrader` |
| 7 | invalid OHLCV | `RejectsInvalidOhlc`, `RejectsNaNAndInfinity`, `RejectsImpossibleDates` |
| 8 | duplicate timestamps | `RejectsDuplicateAndUnsortedTimestamps` |
| 9 | missing candles | `LargeGapProducesWarningNotError`, missing/NaN values rejected |
| 10 | cash accounting | `CashAccountingAndValuationIdentities` (cash never negative; final = initial + realised + unrealised) |
| 11 | portfolio valuation | same + `OpenPositionIsValuedAtLastCloseAndReportedAsUnrealized` |
| 12 | trade P&L | `OneProfitableTrade`, fee tests, cross-check against the Python reference |
| 13 | max drawdown | `MaxDrawdownAndBenchmark`, `MaxDrawdownHelper` |
| 14 | buy-and-hold benchmark | `MaxDrawdownAndBenchmark` |
| 15 | insufficient indicator data | `TooFewCandlesForIndicatorThrows`; API: `INSUFFICIENT_DATA` 422 |
| 16 | no future information | `SignalsNeverUseFutureData` (all 5 strategies), `ChangingFutureBarsDoesNotChangePastTrades` |

Also: stop-loss / take-profit incl. gaps and both-in-one-bar, config validation, duplicate-signal handling, indicator known values (hand-computed RSI), zero-volatility / few-observation metric edge cases, Sharpe/Sortino hand calculation, JSON contract (no NaN/inf ever emitted), CSV loader.

**Database** (`backend/tests/database/test_schema.py`, `test_concurrency.py`): record creation · foreign-key enforcement · unique constraints (PK, symbol) · CHECK and NOT NULL rejection · trigger · cascade/restrict/set-null · atomic save rollback · committed data visible to new connections · stored procedure/function/views · least-privilege accounts · SQL-injection attempts · index use (`EXPLAIN`) · isolation, `FOR UPDATE`, deadlock, concurrent imports and concurrent saves.
*Not applicable:* "user data isolation" (the application has no user accounts, by design).
*Persistence after restart:* tested as "a brand-new connection sees the committed rows". A real MySQL/container restart was **not** automated; in Docker the data sits in the `db_data` volume (`docker compose restart db`, then reopen History, is the manual check).

**API** (`backend/tests/api/test_*.py`): successful requests · invalid requests (field-level 422) · missing resources (404) · database down (503) and engine missing (503) · generic 500 without stack trace · pagination, filtering, sorting (incl. rejection of unknown sort columns) · status codes · CORS · CSV exports match the displayed data.
*Not applicable:* authentication errors.

**Frontend** (`frontend/src/test`): pages load · forms validate (and block submitting) · loading skeletons · error and retry states · empty datasets for every chart · results equal the API response (card values; the candle chart receives exactly the API's candles, volumes and indicators) · every tested button performs its action (Run, Save, Save strategy, import, fetch, delete with confirmation, theme toggle, pagination, filters, sorting, exports).

**Integration:** `scripts/smoke_test.py` drives a running stack: configure → run → save → retrieve → compare → filter/sort trades → export → delete, and checks preview = saved result and CSV = displayed data.

The backend tests create their own throw-away MySQL accounts (`pbe_app_test`, `pbe_ro_test`) with fixed test-only passwords inside the disposable `pbe_test` database they create and drop; no application secret is stored in the repository.

## Defects found by testing (and fixed)

| # | Defect | Cause | Fix |
|---|---|---|---|
| 1 | Deleting an instrument that has saved backtests returned HTTP 500 | MySQL reports this RESTRICT violation as error **1217** here, the code expected 1451 | handle both; the API now answers 409 `IN_USE` (test `test_deleting_instrument_with_saved_backtests_is_blocked`) |
| 2 | A CHECK-constraint violation would have surfaced as a generic 500 | PyMySQL raises `OperationalError(3819)`, not `IntegrityError` | map 3819 (and NOT NULL/range errors) to 422 `INVALID_DATA` |
| 3 | Sort buttons in the trade table were re-created on every render (lost keyboard focus; unreliable repeated clicks) | header sub-component declared **inside** the table component | moved to module level (test `sorts by net P&L in both directions`) |
| 4 | Compare page counted a default strategy that does not exist in the catalogue, so "no strategy selected" was never detected | selection state not intersected with the catalogue | filter by the catalogue |
| 5 | (test bugs, not product bugs) | a mock mis-read a `status: "ok"` health payload as an HTTP status; a deadlock test compared `()` with `[]`; an `EXPLAIN` test assumed an index on a 3-row table | tests corrected |

## Re-verification after the repository reorganisation (November 2026)

After the engine headers, backend packages, frontend components, tests and docs were reorganised (see README, "Project layout"), the following were re-run on Ubuntu 24.04, GCC 13.3, Python 3.12.3, Node 22.23.4, MySQL 8.0.46:

| Check | Result |
|---|---|
| C++ unit tests, Release, `-Wall -Wextra -Wpedantic` | 51 / 51 passed, 0 warnings |
| Same, Debug with `-fsanitize=address,undefined` | 51 / 51 passed, 0 sanitizer reports |
| pytest (backend, database, concurrency, cross-check) | 79 / 79 passed |
| Vitest, `tsc --noEmit`, production build | 49 / 49 passed, type-check clean, build succeeds (bundle size identical to before the move) |
| `scripts.smoke_test` against a live API as the least-privilege `pbe_app` account | 15 / 15 checks passed |
| `scripts.init_db`, `scripts.load_demo_data`, `scripts.demo_concurrency` | ran successfully |

The smoke test found one defect that no unit test covered: `scripts/load_demo_data.py` and `scripts/fetch_real_data.py` still imported the old `app.candle_validation` module path after the move. It is fixed; the scripts are not covered by pytest, so only running them reveals this class of error (`make` does not run them either).

## Reproducing the report's numbers

`python experiments/reproduce_report.py` and `python experiments/robustness.py` regenerate every figure in Chapter 7 of the report from the compiled engine (`make experiments`); `experiments/make_tables.py` and `make_figures.py` turn those results into the LaTeX tables and figures. Known coverage limits of the verification: the independent Python reference (`backend/tests/engine/test_crosscheck.py`) covers SMA and EMA crossovers without stop-loss or take-profit; RSI, MACD, Buy and Hold and the protective exits are covered by the C++ unit tests only.

## What was NOT verified (read this before the demo)

* **Docker (in the verification environment).** There is no Docker in the build environment used for these runs (the author's own Docker run is noted under Windows below). `docker-compose.yml`, both Dockerfiles and `nginx.conf` were written carefully and their *contents* were exercised piecewise (the engine builds with the exact CMake flags used in the Dockerfile; `02_security.sh` was run against a real MySQL; the API was started with the same environment and the least-privilege account; the entrypoint script was run), but **`docker compose up --build` itself has never been run**. Expect to possibly fix small things on first run; see `docs/troubleshooting.md`.
* **MySQL 8.4** (the version in `docker-compose.yml`). Everything was tested on **8.0.46**. The SQL used is standard to both, but 8.4 was not run. (8.0 is end-of-life, which is why the compose file uses 8.4.)
* **Windows (test suites).** The automated suites were not run on Windows. The author reports having built and started the Docker stack on Windows with `db`, `api` and `web` healthy; the PowerShell commands in the README were otherwise not exercised by the verification run.
* **A real browser.** No browser could be installed in the build environment, so the UI has **never been looked at**: layout, colours, responsive behaviour, chart appearance (pane heights, markers, tooltips, TradingView attribution position), dark theme and the Lightweight Charts rendering are untested visually. Component tests with jsdom check data flow and behaviour only. Expect cosmetic issues; fix them while looking at the running app.
* **Live Yahoo Finance download.** No internet in the build environment. The provider code path is tested with a stand-in provider; the real `yfinance` call (ticker handling, rate limits, adjusted-price output) is untested. The synthetic demo data makes the application demonstrable without it.
* Lightweight Charts v5 API calls (panes, markers) were written against its documented API and type-checked, but were never executed against the real library (the tests replace it).
* Performance with very long histories (> 20 000 candles) is capped by `PBE_MAX_CANDLES_PER_RUN` and was not benchmarked.
