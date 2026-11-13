# Syllabus mapping (OOP and DBMS)

Rules used here: a concept is listed as **Implemented** only if it is used by working project code (file named) and, where possible, exercised by a test. **Architecture** means the project is organised that way but there is no dedicated feature. **Not covered** means exactly that. All OOP items refer to the **C++ engine** (`engine/`). The Python API layer is *not* claimed as evidence for any C++-specific feature.

## Part 1 — Object-Oriented Programming (C++17)

| # | Concept | Status | Where | Notes / viva explanation |
|---|---|---|---|---|
| 1 | High-level languages | Architecture | whole project | C++ for the engine, Python for the API, TypeScript for the UI; each chosen for its job (`docs/architecture.md`). |
| 2 | Procedure-oriented vs object-oriented | Implemented (both styles, side by side) | `strategy/indicators.cpp` (free functions in a namespace: stateless numeric procedures) vs `strategy/strategy.hpp`, `execution/portfolio.hpp` (objects with state and behaviour) | Indicators are pure functions of a vector, so procedures are the simplest fit; strategies and the portfolio have identity, state and interchangeable behaviour, so objects are. |
| 3 | Objects and classes | Implemented | `CandleSeries`, `Portfolio`, `Position`, `Broker`, `Backtester`, `Money`, the `Strategy` family | A run creates one `Backtester`, one `Portfolio`, one `Strategy` object. |
| 4 | Abstraction | Implemented | `class Strategy` (pure virtual `type, displayName, params, warmupBars, prepare, signalAt`) in `strategy/strategy.hpp` | The backtester knows only this interface, never a concrete strategy. |
| 5 | Encapsulation | Implemented | `Portfolio` (private `cash_`, `positions_`, `closed_`; only `applyBuy/applySell` change them and enforce "no leverage"); `CandleSeries` (validated in the constructor, read-only afterwards) | Invariants (cash never negative, no duplicate position) cannot be broken from outside. |
| 6 | Inheritance | Implemented | single: `BuyAndHold : Strategy`; **multilevel**: `SmaCrossover : CrossoverStrategy : Strategy`; exceptions: `DataValidationError : EngineError : std::runtime_error` | `CrossoverStrategy` exists only because SMA, EMA and MACD share the crossing logic. |
| 7 | Polymorphism | Implemented | `Backtester::run(const CandleSeries&, Strategy&)`; test `AllStrategiesRunPolymorphically` runs `vector<unique_ptr<Strategy>>` of all five | Same call, different behaviour. |
| 8 | Dynamic binding | Implemented | `strategy.signalAt(i)` inside the loop is resolved at run time through the vtable | |
| 9 | Message passing | Architecture | `Backtester` → `Strategy::signalAt`, `Broker::buyFill`, `Portfolio::applyBuy` | Objects cooperate only by calling each other's public methods. |
| 10 | Operator overloading | Implemented | `Money`: `+ - * += -= unary- < > <= >= ==`, `operator<<` (`core/money.hpp`); test `MoneyOperators` | `cash_ -= cost` reads like arithmetic. |
| 11 | Constructors and destructors | Implemented | validating constructors (`SmaCrossover(fast, slow)` throws on bad values); `Strategy()` counts instances; `NumericBuffer` ctor/dtor release `new[]`/`delete[]` | |
| 12 | Static class data | Implemented | `Strategy::created_` + `static instancesCreated()`; `StrategyFactory::registry()` (function-local static table); test `StaticInstanceCounterAndVirtualDestructor` | |
| 13 | Friend functions | Implemented | `friend Money operator*(double, const Money&)`, `friend operator<<` (`core/money.hpp`); `friend operator<<(ostream&, const Portfolio&)` reads private state (`execution/portfolio.hpp`) | Friend *classes* are not used. |
| 14 | Inline functions | Implemented | in-class accessors (`Money::value()`, `Position::quantity()`, …), `inline bool isLeapYear()` | |
| 15 | Arrays of objects | Implemented (STL form) | `std::vector<Candle>`, `std::vector<std::unique_ptr<Strategy>>`, `std::vector<Trade>` | A C-style array of class objects is not used. |
| 16 | Const member functions and objects | Implemented | every getter is `const`; `const Broker broker(...)`; `const CandleSeries&` parameters | |
| 17 | Memory management | Implemented | RAII and smart pointers everywhere; `NumericBuffer` manages a raw heap array by hand. Run under AddressSanitizer + UBSan: 51/51 tests, no findings | `NumericBuffer` holds the equity series; `std::vector<double>` would do the same job. It exists to exercise manual memory management and the Rule of Five with real use (and tests). |
| 18 | Inheritance types / access modes | Partly | `public` inheritance throughout; `protected` helper `CrossoverStrategy::crossSignal`; `private` data members | **Private and protected inheritance, multiple and virtual inheritance are not used**: there was no honest need. |
| 19 | Abstract classes | Implemented | `Strategy`; `CrossoverStrategy` (still abstract: does not implement `type()`) | |
| 20 | Virtual / pure virtual functions | Implemented | `Strategy`: pure `= 0` members and one virtual with a default (`indicators()`); `override` on every implementation | |
| 21 | Function and operator overloading | Implemented | operators on `Money`; overloaded `num(double)` / `num(const std::optional<double>&)` in `io/json_io.cpp`; constructors `Money()` / `Money(double)` | Function overloading is the weaker example; the operator set is the main one. |
| 22 | Object copying and copy constructors | Implemented | `NumericBuffer(const NumericBuffer&)` deep copy; test `NumericBufferDeepCopyAndAssignment` shows the copy is independent | Default member-wise copy would share the pointer → double delete. |
| 23 | Assignment operators | Implemented | `NumericBuffer::operator=` (copy-and-swap, self-assignment safe, tested with `c = c`), move assignment | |
| 24 | Virtual destructors | Implemented | `virtual ~Strategy() = default;` — strategies are deleted through `unique_ptr<Strategy>` | Without it, deleting a derived object through the base pointer is undefined behaviour. |
| 25 | Strings | Implemented | `std::string` dates, symbols, CSV cells; strict ISO date parsing (`core/date_util.cpp`) | |
| 26 | File handling | Implemented | `CsvCandleLoader::load` (`std::ifstream`), `engine --input file.json`, request key `candles_csv` | |
| 27 | Exception handling | Implemented | hierarchy in `core/errors.hpp`; `handleRequest` catches `EngineError` and turns it into `{ok:false, error:{code}}`; tests `ErrorsAreStructuredNeverThrown` | |
| 28 | Templates | Implemented | `template <typename T> class RollingWindow` (used for the SMA; tested with `int` and `double`) | Only one class template; no function templates beyond the STL. |
| 29 | STL containers, algorithms, iterators | Implemented | `vector, map, optional, unique_ptr, function`; `std::accumulate`, `transform`, `sort`, `min/max`, `floor`; `CandleSeries::begin()/end()` so range-for works on it | |

**OOP not covered:** multiple/virtual inheritance, private/protected inheritance, friend classes, overloading `new`/`delete`, `static_cast`-style RTTI features (`dynamic_cast`, `typeid`).

## Part 2 — Database Management Systems (MySQL)

| # | Concept | Status | Where | Notes / viva explanation |
|---|---|---|---|---|
| 1 | Database architecture, data independence | Architecture + implemented | three layers: UI → API → `repositories/` → MySQL; `v_run_summary` view | The API's history query reads the **view**; the physical join/column layout can change without touching callers (logical data independence). Indexes can be added without changing any query (physical independence). |
| 2 | ER diagrams | Implemented | `docs/database.md` (Mermaid) | |
| 3 | Entities, attributes, relationships, cardinality | Implemented | same; 1:N and one 1:1 (`backtest_runs`–`backtest_metrics`); `backtest_runs` is the associative entity between instruments and strategy types | |
| 4 | Keys and integrity constraints | Implemented | PK, composite PK (`candles`), candidate key (`instruments.symbol`), FKs with explicit ON DELETE rules, UNIQUE, NOT NULL, CHECK, trigger (`schema.sql`); tests in `test_database.py` | Entity integrity = PKs; referential = FKs; domain = types, ENUM, CHECK. |
| 5 | Relational model | Implemented | 15 relations in `schema.sql` | |
| 6 | Relational algebra | Documentation + equivalent SQL | `docs/database.md`, `docs/academic/sql-demos.sql` | Expressions are written out; MySQL is not a relational-algebra engine, the SQL is the executable form. |
| 7 | Functional dependencies | Documentation | `docs/database.md` | |
| 8 | Normalisation 1NF–BCNF | Implemented in the design, argued in the docs | parameter rows (1NF), `indicator_series`/`indicator_values` split (2NF), instrument not copied into `trades` (3NF), deliberate denormalisations listed with reasons | |
| 9 | Decomposition | Implemented + documented | the indicator split: lossless-join and dependency-preserving | |
| 10 | Query processing and optimisation | Demonstrated | `EXPLAIN` demos (`sql-demos.sql` §9), test `test_queries_use_indexes` | Shows index range scan vs. non-sargable `YEAR(trade_date)=…`. |
| 11 | SQL: DDL, DML, DCL | Implemented | DDL `schema.sql`; DML `repositories/`; DCL `02_security.sh` (`CREATE USER`, `GRANT`) | TCL: `COMMIT`/`ROLLBACK` in `db.transaction`. |
| 12 | PK, FK, UNIQUE, NOT NULL | Implemented | see 4 | |
| 13 | Transactions and ACID | Implemented | `db.transaction()`, `repositories.runs.save_run`; test `test_save_is_atomic_all_or_nothing` | |
| 14 | Concurrent execution and serializability | Demonstrated, not formally implemented | `test_concurrency.py`, `scripts/demo_concurrency.py` | Default isolation is REPEATABLE READ, which is **not** serializable in general; `SERIALIZABLE` exists and is explained. The app does not need it. |
| 15 | Locking and concurrency control | Demonstrated | `SELECT … FOR UPDATE` test (no lost updates), InnoDB row locks and MVCC | |
| 16 | Deadlocks and isolation | Demonstrated | deadlock test and demo script (error 1213, one victim rolled back); isolation behaviour test | |
| 17 | Recovery and atomicity | Atomicity demonstrated; recovery explained only | rollback test; durability via InnoDB redo log (write-ahead logging) and the Docker volume | Crash recovery is done by InnoDB; it is **not** implemented or tested here. |
| 18 | Stored procedures, functions, cursors, triggers | Implemented | `sp_verify_run_integrity` (cursor), `fn_return_pct`, `trg_candles_bi/bu`; tests | |
| 19 | Database security | Implemented | least-privilege accounts, parameterised queries, injection test, secrets in `.env`, port bound to localhost | Not implemented: row-level security, encryption at rest, TLS to MySQL. |
| 20 | NoSQL and distributed databases | Not covered | — | Discussion only (`docs/database.md`). |

## Short code examples for the viva

```cpp
// Abstraction + polymorphism + virtual destructor  (engine/include/pbe/strategy/strategy.hpp)
class Strategy {
 public:
  virtual ~Strategy() = default;
  virtual Signal signalAt(std::size_t i) const = 0;      // pure virtual
};
Signal s = strategy.signalAt(i);                         // Backtester: dynamic binding
```
```cpp
// Operator overloading + friend  (engine/include/pbe/core/money.hpp)
cash_ -= cost;                                           // Money::operator-=
friend Money operator*(double k, const Money& m);        // 2 * money
```
```cpp
// Rule of five  (engine/include/pbe/core/containers.hpp)
NumericBuffer(const NumericBuffer& o);                   // deep copy
NumericBuffer& operator=(const NumericBuffer& o);        // copy-and-swap
~NumericBuffer() { delete[] data_; }
```
```sql
-- Cursor inside a stored procedure  (database/schema.sql)
DECLARE c_trades CURSOR FOR SELECT net_pnl FROM trades WHERE run_id = p_run_id AND status = 'closed';
OPEN c_trades; read_loop: LOOP FETCH c_trades INTO v_pnl; IF v_done = 1 THEN LEAVE read_loop; END IF; ... END LOOP;
```
```sql
-- Atomic save: one transaction over many tables  (backend/app/core/db.py + repositories.runs.save_run)
START TRANSACTION; INSERT INTO backtest_runs ...; INSERT INTO trades ...; ...; COMMIT;   -- or ROLLBACK on any error
```
