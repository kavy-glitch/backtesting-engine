# Portfolio Backtesting Engine

A full-stack strategy backtesting application for the B.Tech (Mathematics & Computing) OOP and DBMS projects at SVNIT Surat.

| Layer | Technology | Where |
|---|---|---|
| Simulation engine | **C++17** (OOP: abstract classes, polymorphism, templates, STL, RAII) | `engine/` |
| API | Python 3.12, FastAPI, PyMySQL (parameterised SQL) | `backend/` |
| Database | **MySQL 8** (InnoDB): constraints, trigger, procedure + cursor, function, views, least-privilege users | `database/` |
| Frontend | React 19 + TypeScript + Tailwind + TradingView Lightweight Charts | `frontend/` |
| Packaging | Docker Compose (`db`, `api`, `web`) | `docker-compose.yml` |

```
Browser ──► nginx (web) ──► FastAPI (api) ──► MySQL (db)
                              │
                              └─► engine (C++ executable, JSON in / JSON out)
```

## What you can do with it

* Load **real** daily prices (Yahoo Finance via `yfinance`, or your own CSV files) or the bundled **synthetic** demo data (always labelled `SYNTHETIC`).
* Backtest **Buy & Hold, SMA crossover, EMA crossover, RSI threshold, MACD crossover** with initial capital, position sizing (% of cash or fixed quantity), fees (% and flat), slippage (bps), optional stop-loss / take-profit, risk-free rate.
* See an interactive **candlestick chart** (volume, SMA/EMA overlays, RSI and MACD panes, buy/sell markers, trade tooltips, zoom/pan/crosshair, date-range buttons), **equity curve vs buy & hold**, **drawdown**, daily returns, trade P&L, a sortable/filterable/paginated **trade table** with detail view, and every metric with an explanation when it cannot be computed.
* **Save** backtests and strategies in MySQL, reopen them from **History**, **export** trades / equity / metrics / summary as CSV, **compare** up to six strategies on the same data.
* Light and dark theme, responsive layout, skeleton loading states, empty and error states, toast notifications, form validation.

Execution rules (no look-ahead): a signal formed at a candle's **close** is filled at the **next candle's open**, with slippage and fees. Long-only, no leverage. Full details: [`docs/engine.md`](docs/engine.md).

> **Educational tool.** Backtests are simulations on historical data and say nothing certain about future results. The bundled demo prices are random numbers, not market data.

---

## Quick start (Windows + Docker) — recommended

You need: **Docker Desktop** (WSL 2 backend enabled), **Git**, **VS Code** (optional). You do **not** need Python, Node.js, MySQL or a C++ compiler for this path; everything is built inside containers.

All commands are **PowerShell**, run from the project folder.

| # | Do this | What it does | You should see |
|---|---|---|---|
| 1 | Start Docker Desktop and wait until it says "Engine running". | The Docker engine must be up. | Whale icon steady. `docker version` prints a Client and a Server section. |
| 2 | `code .` (or open the folder in VS Code) | Opens the project. | The folders `engine`, `backend`, `database`, `frontend`, `docs`. |
| 3 | `Copy-Item .env.example .env` | Creates your private settings file. | A new `.env` file. **Open it and replace every `CHANGE_ME…` value** with your own passwords. |
| 4 | `docker compose up --build -d` | Builds the three images (C++ engine is compiled inside) and starts them. First run takes several minutes. | Ends with `Container pbe-web-1 Started`. |
| 5 | `docker compose ps` | Lists containers. | `db`, `api`, `web` all `running` / `healthy` (the API needs ~30 s). |
| 6 | `docker compose logs api` | Shows API start-up. | `Loading synthetic demo data…`, then `SYNTH-TREND: inserted 780 …  [SYNTHETIC]`, `strategy catalogue synchronised (5 strategies)`. |
| 7 | Open **http://localhost:8080** | The application. | Overview page, top-right pill says **All systems ready**. |
| 8 | Click **Backtest**, keep the defaults (`SYNTH-TREND`, SMA Crossover 10/30), press **Run backtest**. | Runs the engine. | Eight summary cards, candlestick chart with BUY/SELL arrows, trades table. |
| 9 | Press **Save**, then open **History**. | Stores the run in MySQL. | The run appears with its return, drawdown and Sharpe; export links (`trades.csv` …) appear above the results. |
| 10 | `docker compose exec api python -m scripts.smoke_test` | Automated end-to-end check of the running stack. | `ALL CHECKS PASSED` |
| 11 | Open **http://localhost:8000/docs** | Interactive API documentation (the Swagger page loads its scripts from a CDN, so it needs internet). | Swagger UI listing every endpoint. |

### Real market data

In the app: **Market data → Fetch from Yahoo Finance**, ticker `RELIANCE.NS` (NSE stocks end in `.NS`, BSE in `.BO`, indices start with `^`, e.g. `^NSEI`). Or from PowerShell:

```powershell
docker compose exec api python -m scripts.fetch_real_data RELIANCE.NS TCS.NS INFY.NS --start 2019-01-01
```

This needs internet and uses the unofficial `yfinance` library (personal/educational use; prices are split/dividend adjusted). **If Yahoo is unreachable at your demo, you can still demonstrate with the synthetic data, or import a CSV** (Market data → CSV). After one successful fetch, the data lives in MySQL and works offline. Save a backup with `--save-csv data/real` if you like.

### CSV format

```
Date,Open,High,Low,Close,Volume
2024-01-01,2750.10,2790.00,2741.55,2781.30,5123456
```
Dates `YYYY-MM-DD` (a time suffix is tolerated), extra columns ignored. Invalid files are rejected as a whole with row numbers (bad dates, non-numeric or missing values, high < low, non-positive prices, negative volume, duplicate dates). Unsorted files are sorted with an explicit warning; gaps over 10 days produce a warning.

### Stop / reset

```powershell
docker compose down        # stop, keep the database
docker compose down -v     # stop AND delete the database volume (also needed after editing database/schema.sql)
```

---

## Running the tests

| Suite | Command | Needs |
|---|---|---|
| C++ unit tests (51) | `docker build --target engine-tests -f backend/Dockerfile .` (or `make engine-test`) | Docker (downloads GoogleTest during the build) |
| Backend, database, concurrency, engine cross-check (79) | `docker compose --profile test run --rm tests` | Docker; uses its own throw-away database `pbe_test` |
| Frontend (49) | `docker build --target test frontend` | Docker |
| End-to-end on the running stack | `docker compose exec api python -m scripts.smoke_test` | stack running |

What each suite covers and the actual results obtained are in [`docs/testing.md`](docs/testing.md).

## Running without Docker (optional)

Install Python 3.12, Node.js 22, MySQL 8.x, CMake and a C++17 compiler (Visual Studio Build Tools, workload "Desktop development with C++"). Then, in PowerShell:

```powershell
# 1. build the engine
cmake -S engine -B engine/build -DPBE_BUILD_TESTS=ON
cmake --build engine/build --config Release
ctest --test-dir engine/build -C Release            # C++ tests

# 2. database (as the MySQL root user; choose your own password)
mysql -uroot -p -e "CREATE DATABASE pbe CHARACTER SET utf8mb4; CREATE USER 'pbe_app'@'localhost' IDENTIFIED BY 'YOUR_PASSWORD'; GRANT SELECT,INSERT,UPDATE,DELETE,EXECUTE ON pbe.* TO 'pbe_app'@'localhost';"
mysql -uroot -p pbe -e "source database/schema.sql"

# 3. backend
cd backend
python -m venv .venv ; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:PBE_DB_HOST="127.0.0.1"; $env:PBE_DB_NAME="pbe"; $env:PBE_DB_USER="pbe_app"; $env:PBE_DB_PASSWORD="YOUR_PASSWORD"
$env:PBE_ENGINE_PATH="$PWD\..\engine\build\Release\engine.exe"
python -m scripts.load_demo_data
uvicorn app.main:app --port 8000

# 4. frontend (second terminal)
cd frontend ; npm ci ; npm run dev                  # http://localhost:5173 (proxies /api to :8000)
```

> This path was **not** run on Windows by the author (see "Verification status" in `docs/testing.md`). The Docker path is the supported one.

## Project layout

```
portfolio-backtesting-engine/
├── engine/                     C++17 simulation engine (no HTTP, no database)
│   ├── include/pbe/
│   │   ├── core/               types, errors, money, date_util, containers (RollingWindow<T>, NumericBuffer)
│   │   ├── data/               candle_series (validation), csv_loader
│   │   ├── strategy/           indicators, strategy (abstract Strategy, 5 strategies, factory)
│   │   ├── execution/          broker, portfolio, backtester (simulation loop), metrics
│   │   └── io/                 json_io (the engine's JSON contract)
│   ├── src/                    implementation files, same sub-folders; main.cpp = command-line tool
│   ├── tests/                  GoogleTest: one file per suite (51 tests)
│   └── third_party/nlohmann/   vendored JSON library
├── backend/                    Python 3.12 FastAPI service
│   ├── app/
│   │   ├── main.py             application factory
│   │   ├── api/                schemas.py (pydantic) and routers/ (health, instruments, strategies, backtests)
│   │   ├── services/           backtests.py (orchestration), exports.py (CSV), candle_validation.py
│   │   ├── repositories/       all SQL: instruments.py, strategies.py, runs.py
│   │   ├── integrations/       engine_client.py (subprocess bridge), providers.py (Yahoo Finance)
│   │   └── core/               config, db (connection + transaction), db_init, errors, deps
│   ├── scripts/                init_db, load_demo_data, fetch_real_data, generate_synthetic_data, smoke_test, demo_concurrency
│   └── tests/                  api/, database/, engine/ (cross-check against an independent Python reference); 79 tests
├── database/                   schema.sql (tables, constraints, trigger, procedure, function, views), 02_security.sh (accounts)
├── frontend/src/               React + TypeScript
│   ├── pages/                  Overview, Backtest, Compare, Strategies, History, Data
│   ├── components/             ui/, charts/, backtest/ (form, results, metrics, trades), layout/, effects/ (cover, cinematic, cursor)
│   ├── api/ lib/ test/         typed client and types; validation, formatting, hooks; Vitest (49 tests)
├── data/sample/                SYNTH-*.csv (SYNTHETIC demo candles; regenerate with python -m scripts.generate_synthetic_data)
├── experiments/                reproduce_report.py and robustness.py: regenerate every number in the report (results.json, robustness.json)
├── report/                     report.tex, figures/ and the built report.pdf
├── docs/                       architecture.md, engine.md, database.md, api.md, testing.md, troubleshooting.md
│   └── academic/               syllabus-mapping.md, viva-qa.md, demo-script.md, worked-example.md, sql-demos.sql
├── Makefile                    make test | experiments | report | up | down | smoke
└── docker-compose.yml  .env.example  THIRD_PARTY_NOTICES.md
```

## Reproducing the report's numbers

Every figure and table in Chapter 7 of the report is produced by code, not typed in:

```bash
make experiments     # builds the engine, then writes experiments/results.json and experiments/robustness.json
make report          # rebuilds report/report.pdf (needs a LaTeX installation)
```

## Documentation index

* [`docs/architecture.md`](docs/architecture.md): components, data flow, design decisions
* [`docs/engine.md`](docs/engine.md): execution model, indicator and metric definitions, engine JSON contract
* [`docs/database.md`](docs/database.md): ER diagram, schema, normalisation, SQL examples, security
* [`docs/api.md`](docs/api.md): every endpoint
* [`docs/testing.md`](docs/testing.md): tests, actual results, verification status
* [`docs/troubleshooting.md`](docs/troubleshooting.md)
* For the course submission and demonstration: [`docs/academic/syllabus-mapping.md`](docs/academic/syllabus-mapping.md) (OOP and DBMS syllabus to code), [`worked-example.md`](docs/academic/worked-example.md), [`demo-script.md`](docs/academic/demo-script.md), [`viva-qa.md`](docs/academic/viva-qa.md), [`sql-demos.sql`](docs/academic/sql-demos.sql)

## Known limitations

* Long-only, one instrument per run, daily candles only (no intraday), market orders only, no leverage, no dividends/taxes modelling (Yahoo prices are already adjusted).
* One position at a time; the whole position is sold on an exit signal.
* No user accounts: it is a single-user local application (database access is still least-privilege).
* `yfinance` is unofficial and can break without notice; CSV import and the database cache are the fallback.
* Sharpe/Sortino use daily mark-to-market returns of the **portfolio** (including idle cash) annualised with 252 days.
* Multi-asset portfolios are not implemented. The `Portfolio` class stores positions per symbol, so the engine is ready for it, but nothing above the engine exposes it.
