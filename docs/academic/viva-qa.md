# Viva questions and answers

## Project and finance

**1. What does the project do?** It simulates a trading strategy on historical daily prices: it generates buy/sell signals, executes them with fees and slippage, tracks cash and positions, and reports returns, drawdown, win rate, Sharpe etc., with charts. Results and strategies are stored in MySQL.

**2. What is look-ahead bias and how do you avoid it?** Using information that was not available at decision time, e.g. trading at the close price that was used to compute the signal. Here a signal is computed from candles up to *i* and executed at the **open of *i+1***. Indicator value *i* depends only on inputs 0…*i*. Test: truncating the data never changes a signal, and rewriting future candles leaves earlier equity unchanged.

**3. How are fees and slippage modelled?** Fee = value × % + flat, on each fill. Slippage moves the fill price against you by some basis points (buys higher, sells lower).

**4. What is maximum drawdown?** The largest fall from a running equity peak to a later trough, as a percentage of the peak. Reported positive (18 % means −18 %).

**5. Sharpe ratio?** `mean(daily return − rf/252) / sample-std(daily return) × √252`. Returns are the portfolio's daily mark-to-market returns including days in cash. Undefined (shown "–" with a reason) when the volatility is zero or there are under two returns.

**6. Sortino?** Like Sharpe but the denominator is the downside deviation `√mean(min(r − rf_d, 0)²)` over all observations, so only losses count as risk.

**7. Why is the buy-and-hold benchmark slightly different from the Buy-and-Hold strategy?** The benchmark is idealised and buys at the first open; a strategy forms its signal at the first close and buys at the second open.

**8. What happens if the account can't afford the order?** It is rejected and listed in the result ("insufficient funds"); there is no leverage and cash never goes negative.

**9. What if stop-loss and take-profit are both inside the same candle?** The stop is assumed to hit first (conservative) because daily data cannot tell the intraday order. Gaps through a level fill at the open.

**10. Is the engine correct?** 51 unit tests (hand-computed cases, edge cases), an independent Python re-implementation compared on 18 scenarios (every trade and equity point agree to 1e-9), accounting identities (`final = initial + realised + unrealised`), and sanitizers (no memory errors).

**11. Why synthetic data? Is it fake?** It is generated random data, clearly labelled `SYNTHETIC` in the database (`is_synthetic`), UI badge and file names, so the app demos offline. Real data comes from Yahoo Finance or CSV.

**12. Limitations?** Daily candles, long-only, one instrument, market orders, no dividends/taxes (Yahoo prices are adjusted), `yfinance` unofficial, no login, not tested with a real browser or on Windows by the author (be honest).

## OOP (C++ engine)

**13. Where is abstraction?** `class Strategy` declares the pure virtual interface; the backtester depends on it only.

**14. Where is polymorphism, and dynamic binding?** `Backtester::run(candles, Strategy&)` calls `strategy.signalAt(i)`; which function runs is decided at run time via the vtable. Test: one `vector<unique_ptr<Strategy>>` runs all five.

**15. Why a virtual destructor?** Strategies are owned through `unique_ptr<Strategy>`. Deleting a derived object through a base pointer with a non-virtual destructor is undefined behaviour (derived part not destroyed).

**16. Pure virtual vs virtual?** Pure (`= 0`) forces derived classes to implement it and makes the class abstract (`signalAt`); a plain virtual has a default that may be overridden (`indicators()` returns empty).

**17. Show inheritance with access modes.** `SmaCrossover : public CrossoverStrategy : public Strategy`. `CrossoverStrategy::crossSignal` is `protected` (usable by derived classes only); data is `private`. (Private/protected inheritance and multiple inheritance are not used, and I say so.)

**18. Why `Portfolio` has private members?** Encapsulation: only `applyBuy/applySell` can change cash and positions, so rules like "no leverage" and "one position per symbol" cannot be bypassed.

**19. Operator overloading and friend?** `Money` overloads `+ - * += -= <` etc. and `operator<<`; `operator*(double, Money)` and `operator<<` are `friend` functions so that `2 * money` and streaming work (non-member, access to the private value).

**20. Rule of Three/Five?** `NumericBuffer` owns a raw `double[]`: destructor, copy constructor (deep copy), copy assignment (copy-and-swap, self-assignment safe), move constructor, move assignment. Default copying would copy the pointer and double-delete. Test: copies are independent. (It holds the equity series; `std::vector` would also work. It is there to practise manual memory management, and I'd use a vector in production.)

**21. Templates?** `RollingWindow<T>` is a fixed-size circular window used by the SMA; tested with `int` and `double`.

**22. Exceptions?** `EngineError` base (carries a code) with `DataValidationError`, `InvalidParameterError`, …; `handleRequest` converts them to `{"ok":false,"error":{…}}` so malformed input never crashes the engine.

**23. Static class data?** `Strategy::created_` counts constructions; the strategy registry is a function-local static, built once on first use.

**24. Const-correctness?** Getters are `const`, `Backtester` and `Broker` instances are `const` where possible, data passed by `const&`.

**25. Memory management?** RAII everywhere, `unique_ptr` for ownership, no naked `new` except `NumericBuffer`. The test-suite also ran under AddressSanitizer and UBSan with no findings.

**26. Why C++ at all, and how does it talk to the web app?** The OOP syllabus is C++; the simulation is where OO design fits. FastAPI starts the `engine` executable per run: JSON request on stdin, JSON result on stdout. Simple, testable, crash-isolated.

## DBMS (MySQL)

**27. Explain your ER model.** `instruments` 1—N `candles`; `backtest_runs` is the associative entity between an instrument and a strategy type and 1—N to `trades`, `equity_points`, `indicator_series`; 1—1 to `backtest_metrics`. See `docs/database.md`.

**28. Keys?** `candles` has a composite primary key `(instrument_id, timeframe, trade_date)`, which makes duplicates impossible. `instruments.symbol` is a candidate key (UNIQUE). Surrogate keys elsewhere.

**29. Integrity constraints?** Entity (PK), referential (FK with ON DELETE rules: CASCADE for owned data, RESTRICT for referenced master data, SET NULL for optional links), domain (types, ENUM, CHECK `high ≥ low` …), plus a trigger for "no future candles" (CHECK can't use `UTC_DATE()`).

**30. Normalisation?** Parameters are rows, not comma lists (1NF). Indicators are split into series + values because `panel` depends only on (run, series) — a partial dependency (2NF) in a single table. The instrument is not repeated in `trades` (avoids the transitive FD run → instrument). Deliberate denormalisation: stored P&L columns and metrics are snapshots of an engine run, protected by `sp_verify_run_integrity`.

**31. Functional dependency example?** In `candles`: `(instrument_id, timeframe, trade_date) → open, high, low, close, volume`; in `indicator_points` (rejected design): `(run_id, series_name) → panel`.

**32. ACID — show it.** `save_run` inserts into up to 9 tables in one transaction. A test makes the trades insert fail after the run/metrics rows were written and proves everything is rolled back. Durability: InnoDB redo log + Docker volume.

**33. What isolation level, and what does it prevent?** REPEATABLE READ (InnoDB default): no dirty reads, no non-repeatable reads (snapshot). It is not serializable in general; `SERIALIZABLE` exists. `demo_concurrency.py` shows the snapshot.

**34. Locking and deadlock?** `SELECT … FOR UPDATE` takes row locks (no lost updates in the 8-thread test). Two transactions locking rows A,B vs B,A deadlock; InnoDB detects the cycle, rolls back one (error 1213) and the other commits.

**35. Stored procedure with cursor — why?** `sp_verify_run_integrity` walks a run's trades row by row, sums P&L and compares it with the metrics. It is an audit of the deliberate denormalisation. (A `SUM()` would be shorter; the cursor is there because an audit that processes rows one at a time is a legitimate use.)

**36. Trigger?** `trg_candles_bi/bu` raise SQLSTATE 45000 for candles dated in the future.

**37. Indexes and optimisation?** FK columns lead the indexes; the candle range query uses the primary key as a range scan (`EXPLAIN` in the tests); `YEAR(trade_date)=…` would not use it (non-sargable).

**38. Database security?** Least-privilege accounts (the API user cannot DROP/ALTER; a read-only user), parameterised queries (injection test), secrets in `.env`, DB port bound to localhost. Not done: TLS to the DB, row-level security.

**39. Why MySQL not NoSQL?** Relational data with integrity needs (ledger, FKs, transactions). A document store would not enforce those across tables.

**40. How would you recover after a crash?** InnoDB replays its redo log and rolls back uncommitted transactions at start-up (write-ahead logging). Backups: `mysqldump`. (Explained, not implemented.)
