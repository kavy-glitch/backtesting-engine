# Demonstration script (about 12 minutes)

**Before the TA arrives:** `docker compose up -d`, wait until `docker compose ps` shows everything healthy, open http://localhost:8080 and http://localhost:8000/docs in two tabs, run `docker compose exec api python -m scripts.smoke_test` once (it must print `ALL CHECKS PASSED`). If you want real data, fetch it now (internet): `docker compose exec api python -m scripts.fetch_real_data RELIANCE.NS TCS.NS --start 2019-01-01`. **Have the synthetic data as the fallback** and say so honestly: "this is generated demo data".

| Min | Do | Say |
|---|---|---|
| 0–1 | **Overview** page | "A backtesting engine: the simulation is C++, the API is FastAPI, the data is in MySQL, the UI is React. The pill shows the database and the engine are connected." |
| 1–2 | **Market data** page. Point at the `SYNTHETIC` badges. Open *Import CSV* on an instrument and upload a **broken** CSV (one row with `High < Low`, one with a duplicate date). | "Nothing invalid is stored. The whole file is rejected with the row numbers." (Optionally fetch a ticker from Yahoo: "real data, adjusted for splits and dividends".) |
| 2–4 | **Backtest** page: SYNTH-TREND (or RELIANCE.NS), SMA 10/40, fee 0.1 %, slippage 5 bps → **Run**. Show the eight cards. Type a negative capital to show the validation. | "Signals form at a candle's close and fill at the next open, so there is no look-ahead. Fees and slippage always hurt the trader. Every number comes from the engine." |
| 4–6 | Chart tab: hover candles (OHLC legend), zoom/pan, press 3M/1Y, hover a trade marker; switch strategy to RSI to show the RSI pane, MACD for the MACD pane. | "Real candlesticks with volume; arrows are the actual fills." |
| 6–7 | **Equity & drawdown**, then **Trades** (sort by P&L, filter losers, open a trade). | "Max drawdown is peak-to-trough on the equity curve. The open position is valued at the last close and shown as OPEN, not hidden." |
| 7 | **All metrics**: point at a "–" with its explanation. | "No NaN or infinity: when Sharpe can't be computed the screen says why." |
| 7–8 | **Save**, open **History**, open the run, click `trades.csv`. | "Saved in one database transaction across nine tables. The export equals the screen." |
| 8–9 | **Compare**: tick all five strategies → Compare. | "Same data, same costs, benchmark dashed." |
| 9–11 | DBMS: `docker compose exec db mysql -uroot -p pbe` and paste from `docs/academic/sql-demos.sql` §2, §3, §9, §10 (rejected inserts), §11 (procedure with cursor), §12 (rollback). Then `docker compose exec api python -m scripts.demo_concurrency`. Show `SHOW GRANTS` for the app user. | "Constraints, trigger, cursor, transaction rollback, REPEATABLE READ and a real deadlock where InnoDB kills one transaction. The API account cannot drop tables." |
| 11–12 | OOP: open `engine/include/pbe/strategy/strategy.hpp`, `core/money.hpp`, `core/containers.hpp`; run tests `docker compose --profile test run --rm tests`. | "Abstract `Strategy`, virtual destructor, operator overloading, template, Rule of Five. Plus an independent Python re-implementation that has to agree with the engine on every trade." |

**If something fails live:** Yahoo down → use synthetic data (it is built in). Port busy → change `PBE_WEB_PORT` in `.env`, `docker compose up -d`. Page blank → `docker compose logs api web`. See `docs/troubleshooting.md`.

**Be upfront about:** daily candles only, long-only, one instrument per run, no login, synthetic demo prices, yfinance is unofficial.
