# Portfolio Backtesting Engine

A full-stack strategy backtesting application built for the B.Tech (Mathematics & Computing) OOP and DBMS projects at SVNIT Surat.

Test trading strategies on historical market data using a C++ simulation engine, Python API, MySQL database and interactive React dashboard.

---

## Table of Contents

- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Features](#features)
- [Execution Rules](#execution-rules)
- [Quick Start](#quick-start-windows--docker-recommended)
- [Real Market Data](#real-market-data)
- [CSV Format](#csv-format)
- [Stop and Reset](#stop-and-reset)
- [Running the Tests](#running-the-tests)
- [Running Without Docker](#running-without-docker-optional)
- [Project Structure](#project-structure)
- [Reproducing the Report](#reproducing-the-reports-numbers)
- [Documentation](#documentation)
- [Known Limitations](#known-limitations)

---

## Technology Stack

| Layer | Technology | Directory |
|---|---|---|
| Simulation Engine | **C++17** (OOP, abstract classes, polymorphism, templates, STL, RAII) | `engine/` |
| API | Python 3.12, FastAPI, PyMySQL | `backend/` |
| Database | **MySQL 8** (InnoDB, constraints, triggers, procedures, functions, views) | `database/` |
| Frontend | React 19, TypeScript, Tailwind CSS, TradingView Lightweight Charts | `frontend/` |
| Packaging | Docker Compose (`db`, `api`, `web`) | Root |

## Architecture

The application uses a layered architecture:

```text
Browser
   |
   v
nginx (web)
   |
   v
FastAPI (api)
   |
   +-----------> MySQL (db)
   |
   v
C++ Engine
(JSON input / JSON output)
```

The C++ engine handles the backtesting calculations independently. The FastAPI backend manages API requests, database operations and communication with the engine. The React frontend provides the interactive user interface.

## Features

### Backtesting

- Load real daily market prices through Yahoo Finance using `yfinance`.
- Import your own historical CSV files.
- Use bundled synthetic demo datasets, clearly labelled `SYNTHETIC`.
- Backtest the following strategies:
  - Buy & Hold
  - SMA Crossover
  - EMA Crossover
  - RSI Threshold
  - MACD Crossover
- Configure initial capital and position sizing.
- Configure percentage and flat fees.
- Configure slippage in basis points.
- Set optional stop-loss and take-profit levels.
- Configure the risk-free rate.

### Charts and Analytics

- Interactive candlestick charts.
- Volume charts.
- SMA and EMA overlays.
- RSI and MACD indicator panes.
- Buy and sell markers.
- Trade tooltips.
- Zoom, pan, crosshair and date-range controls.
- Equity curve compared with Buy & Hold.
- Drawdown and daily returns.
- Trade profit and loss.
- Sortable, filterable and paginated trade table.
- Detailed trade information.
- Explanations for metrics that cannot be calculated.

### Strategy Management

- Save backtest results and strategies in MySQL.
- Reopen previous runs through History.
- Export trades, equity, metrics and summaries as CSV.
- Compare up to six strategies using the same data.

### User Interface

- Light and dark themes.
- Responsive layout.
- Loading skeletons.
- Empty and error states.
- Toast notifications.
- Form validation.

## Execution Rules

The engine avoids look-ahead bias.

A trading signal formed at a candle's **close** is filled at the **next candle's open**, with applicable slippage and fees.

The engine currently supports:
- Long-only trading.
- No leverage.

For the complete execution model, see [`docs/engine.md`](docs/engine.md).

> **Educational tool:** Backtests are simulations using historical data and cannot predict future results. The bundled synthetic demo prices are randomly generated numbers, not real market data.

---

## Quick Start (Windows + Docker) — Recommended

### Requirements

You need:

- Docker Desktop with the WSL 2 backend enabled.
- Git.
- VS Code (optional).

You do **not** need to install Python, Node.js, MySQL or a C++ compiler for this setup. Everything is built inside Docker containers.

All commands below use **PowerShell** and should be executed from the project root folder.

| Step | Command / Action | Expected Result |
|---|---|---|
| 1 | Start Docker Desktop. | Docker Engine is running. |
| 2 | Open the project folder in VS Code using `code .`. | Project folders are visible. |
| 3 | `Copy-Item .env.example .env` | Creates your private environment file. |
| 4 | Open `.env` and replace every `CHANGE_ME...` value with your own passwords. | Environment settings are configured. |
| 5 | `docker compose up --build -d` | Builds and starts the containers. The first build may take several minutes. |
| 6 | `docker compose ps` | `db`, `api` and `web` containers should be running or healthy. |
| 7 | `docker compose logs api` | Shows API startup and demo data initialization. |
| 8 | Open `http://localhost:8080`. | The application dashboard loads. |
| 9 | Open Backtest, keep the default `SYNTH-TREND` dataset and SMA Crossover 10/30 strategy, then click Run Backtest. | Backtest results, charts and trades appear. |
| 10 | Click Save and open History. | The saved run appears in History. |
| 11 | Run `docker compose exec api python -m scripts.smoke_test`. | Displays `ALL CHECKS PASSED`. |
| 12 | Open `http://localhost:8000/docs`. | Interactive FastAPI Swagger documentation loads. |

The API documentation's Swagger interface loads scripts from a CDN, so an internet connection is required for those resources.

### Real Market Data

You can fetch real market data from the application:

**Market Data → Fetch from Yahoo Finance**

Example ticker symbols:

- `RELIANCE.NS`
- `TCS.NS`
- `INFY.NS`
- `^NSEI`

NSE stocks generally use `.NS`, BSE stocks use `.BO`, and indices can use symbols such as `^NSEI`.

You can also fetch data from PowerShell:

```powershell
docker compose exec api python -m scripts.fetch_real_data RELIANCE.NS TCS.NS INFY.NS --start 2019-01-01
```

This requires internet access and uses the unofficial `yfinance` library.

If Yahoo Finance is unavailable, you can still demonstrate the application using synthetic data or import your own CSV files.

After a successful fetch, the data is stored in MySQL and can be used offline.

### CSV Format

The application accepts CSV files with the following format:

```csv
Date,Open,High,Low,Close,Volume
2024-01-01,2750.10,2790.00,2741.55,2781.30,5123456
```

Requirements:

- Dates must use `YYYY-MM-DD` format. A time suffix is also tolerated.
- Extra columns are ignored.
- Invalid files are rejected with row numbers.
- Invalid dates, non-numeric values, missing values, duplicate dates, invalid prices and negative volume are rejected.
- Unsorted files are sorted with an explicit warning.
- Gaps greater than 10 days produce a warning.

### Stop and Reset

To stop the application while keeping the database:

```powershell
docker compose down
```

To stop the application and delete the database volume:

```powershell
docker compose down -v
```

**Warning:** The second command deletes the database volume and its stored data.

---

## Running the Tests

The project includes separate test suites for the C++ engine, backend, frontend and complete application.

| Test Suite | Command | Requirements |
|---|---|---|
| C++ unit tests (51) | `docker build --target engine-tests -f backend/Dockerfile .` or `make engine-test` | Docker |
| Backend, database, concurrency and engine cross-check (79) | `docker compose --profile test run --rm tests` | Docker |
| Frontend tests (49) | `docker build --target test frontend` | Docker |
| End-to-end smoke test | `docker compose exec api python -m scripts.smoke_test` | Running application |

The backend test suite uses its own temporary database named `pbe_test`.

For detailed test coverage and verification results, see [`docs/testing.md`](docs/testing.md).

## Running Without Docker (Optional)

You can also run the components individually.

### Requirements

Install:

- Python 3.12
- Node.js 22
- MySQL 8.x
- CMake
- A C++17 compiler (Visual Studio Build Tools with the Desktop development with C++ workload on Windows)

### 1. Build the C++ Engine

```powershell
cmake -S engine -B engine/build -DPBE_BUILD_TESTS=ON
cmake --build engine/build --config Release
ctest --test-dir engine/build -C Release
```

### 2. Configure the Database

Run the following commands using the MySQL root account. Replace `YOUR_PASSWORD` with your chosen password.

```sql
CREATE DATABASE pbe CHARACTER SET utf8mb4;

CREATE USER 'pbe_app'@'localhost'
IDENTIFIED BY 'YOUR_PASSWORD';

GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE
ON pbe.* TO 'pbe_app'@'localhost';
```

Load the database schema:

```powershell
mysql -uroot -p pbe -e "source database/schema.sql"
```

### 3. Start the Backend

```powershell
cd backend

python -m venv .venv
.\.venv\Scripts\Activate.ps1

pip install -r requirements.txt

$env:PBE_DB_HOST="127.0.0.1"
$env:PBE_DB_NAME="pbe"
$env:PBE_DB_USER="pbe_app"
$env:PBE_DB_PASSWORD="YOUR_PASSWORD"

$env:PBE_ENGINE_PATH="$PWD\..\engine\build\Release\engine.exe"

python -m scripts.load_demo_data

uvicorn app.main:app --port 8000
```

### 4. Start the Frontend

Open a second PowerShell terminal:

```powershell
cd frontend

npm ci
npm run dev
```

The frontend will be available at:

`http://localhost:5173`

The frontend development server proxies API requests to port `8000`.

> **Verification status:** The standalone setup has not been run on Windows by the author. The Docker setup is the supported path.

---

## Project Structure

```text
portfolio-backtesting-engine/
│
├── engine/                     C++17 simulation engine
│   ├── include/pbe/
│   │   ├── core/                Types, errors, money, date utilities
│   │   ├── data/                Candle series and CSV loader
│   │   ├── strategy/            Indicators and trading strategies
│   │   ├── execution/           Portfolio, broker, backtester and metrics
│   │   └── io/                  JSON input/output
│   ├── src/                     Implementation files and main.cpp
│   ├── tests/                   GoogleTest unit tests
│   └── third_party/             Third-party libraries
│
├── backend/                    Python 3.12 FastAPI service
│   ├── app/
│   │   ├── main.py              Application factory
│   │   ├── api/                 API schemas and routers
│   │   ├── services/             Backtesting and export services
│   │   ├── repositories/         Database queries
│   │   ├── integrations/         Engine bridge and market data providers
│   │   └── core/                Configuration, database and dependencies
│   ├── scripts/                 Database, demo data and utility scripts
│   └── tests/                   Backend and integration tests
│
├── frontend/                   React + TypeScript application
│   └── src/
│       ├── pages/               Overview, Backtest, Compare, Strategies, History, Data
│       ├── components/          UI, charts, backtesting and layout components
│       ├── api/                 Typed API client
│       ├── lib/                 Shared utilities
│       └── test/                Frontend tests
│
├── database/                   MySQL schema and security scripts
│
├── data/
│   ├── sample/                 Synthetic demo datasets
│   └── processed/              Processed market datasets
│
├── docker/                     Additional Docker configuration
│
├── python/                     Python data-processing utilities
│
├── experiments/                Reproducible experiments and analysis
│
├── docs/                        Technical and academic documentation
│   └── academic/               Course mapping, viva and demo material
│
├── report/                      Academic report and figures
│
├── docker-compose.yml           Main Docker Compose configuration
├── .env.example                 Environment configuration template
├── Makefile                     Project automation commands
├── THIRD_PARTY_NOTICES.md       Third-party notices
└── README.md                    Project documentation
```

## Reproducing the Report's Numbers

The figures and tables in Chapter 7 of the report are generated through code.

To reproduce the experiments:

```bash
make experiments
```

This builds the engine and generates:

- `experiments/results.json`
- `experiments/robustness.json`

To rebuild the PDF report:

```bash
make report
```

A LaTeX installation is required to generate the PDF.

## Documentation

The repository contains additional documentation covering the architecture, implementation and academic aspects of the project.

| Document | Description |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | System components, data flow and design decisions |
| [`docs/engine.md`](docs/engine.md) | Execution model, indicators, metrics and engine JSON contract |
| [`docs/database.md`](docs/database.md) | ER diagram, schema, normalization, SQL examples and security |
| [`docs/api.md`](docs/api.md) | API endpoints |
| [`docs/testing.md`](docs/testing.md) | Test coverage, results and verification status |
| [`docs/troubleshooting.md`](docs/troubleshooting.md) | Troubleshooting guide |
| [`docs/academic/syllabus-mapping.md`](docs/academic/syllabus-mapping.md) | OOP and DBMS syllabus mapping |
| [`docs/academic/worked-example.md`](docs/academic/worked-example.md) | Worked example |
| [`docs/academic/demo-script.md`](docs/academic/demo-script.md) | Project demonstration script |
| [`docs/academic/viva-qa.md`](docs/academic/viva-qa.md) | Viva preparation questions and answers |
| [`docs/academic/sql-demos.sql`](docs/academic/sql-demos.sql) | SQL demonstration queries |

## Known Limitations

- Long-only trading.
- One instrument per backtest run.
- Daily candles only; intraday data is not supported.
- Market orders only.
- No leverage.
- No dividend or tax modelling (Yahoo Finance prices are already adjusted).
- Only one position at a time; the entire position is sold on an exit signal.
- No user accounts; the application is designed as a single-user local application.
- `yfinance` is unofficial and may stop working without notice. CSV import and database caching provide alternatives.
- Sharpe and Sortino ratios use daily mark-to-market portfolio returns, including idle cash, annualized using 252 trading days.
- Multi-asset portfolios are not implemented at the application level. The C++ `Portfolio` class supports positions per symbol, but multi-asset backtesting is not exposed through the application.

---

**Portfolio Backtesting Engine** — A full-stack application combining C++ financial simulation, Python backend development, database management and interactive financial visualization.