# Third-party software

| Component | Use | Licence |
|---|---|---|
| nlohmann/json 3.11.3 | JSON in the C++ engine (single header, vendored in `engine/third_party/`) | MIT |
| GoogleTest 1.14 | C++ unit tests (downloaded at build time only when tests are enabled) | BSD-3-Clause |
| TradingView Lightweight Charts 5 | candlestick/equity charts | Apache-2.0. **The licence requires crediting TradingView; the chart attribution logo is kept enabled (`attributionLogo: true`) — do not remove it.** |
| React, React Router, lucide-react, Tailwind CSS, Vite, Vitest, Testing Library | frontend | MIT |
| FastAPI, Starlette, Pydantic, Uvicorn, PyMySQL, pytest | backend | MIT / BSD (see each package) |
| yfinance | optional market-data download | open source (Apache-2.0 at the time of writing; check the package). It is an **unofficial** client for Yahoo's public endpoints, intended for personal/educational use; Yahoo's own terms apply to the data. |
| MySQL 8.x | database server (Docker image `mysql`) | GPL-2.0 (server, not distributed with this project) |

Check each package's licence before redistributing the project outside coursework.
