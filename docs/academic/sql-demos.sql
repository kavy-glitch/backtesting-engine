-- =============================================================================
-- SQL demonstrations for the DBMS viva. Run with:
--   docker compose exec db mysql -uroot -p pbe          (then paste, or:  source /path/file.sql)
--   or any MySQL client connected to the `pbe` database.
-- Needs at least one saved backtest (Backtest page -> Run -> Save).
-- =============================================================================

-- 1. DDL objects ---------------------------------------------------------------
SHOW TABLES;
SHOW CREATE TABLE candles\G

-- 2. SELECT with JOIN + aggregation (relational algebra: project/select/join/group) ------
-- Number of saved runs and average return per strategy
SELECT st.name AS strategy, COUNT(*) AS runs,
       ROUND(AVG(m.total_return_pct), 2) AS avg_return_pct,
       ROUND(MAX(m.max_drawdown_pct), 2) AS worst_drawdown_pct
  FROM backtest_runs r
  JOIN strategy_types st ON st.id = r.strategy_type_id
  JOIN backtest_metrics m ON m.run_id = r.id
 GROUP BY st.id, st.name
HAVING COUNT(*) >= 1
 ORDER BY avg_return_pct DESC;

-- 3. Same data through the view (data independence: callers never see the join) -------------
SELECT run_id, symbol, strategy_name, total_return_pct, max_drawdown_pct, sharpe_ratio
  FROM v_run_summary ORDER BY created_at DESC LIMIT 5;

-- 4. LEFT JOIN + anti-join: instruments without any saved backtest ---------------------------
SELECT i.symbol, COUNT(r.id) AS runs
  FROM instruments i LEFT JOIN backtest_runs r ON r.instrument_id = i.id
 GROUP BY i.id, i.symbol HAVING runs = 0;

-- 5. Sub-query: runs that beat buy & hold --------------------------------------------------------
SELECT run_id FROM backtest_metrics WHERE total_return_pct > buy_hold_return_pct;

-- 6. Window function: running net P&L of one run's closed trades ---------------------------
SELECT trade_no, entry_date, exit_date, ROUND(net_pnl, 2) AS net_pnl,
       ROUND(SUM(net_pnl) OVER (PARTITION BY run_id ORDER BY trade_no), 2) AS cumulative_pnl
  FROM trades WHERE run_id = (SELECT MAX(id) FROM backtest_runs) AND status = 'closed';

-- 7. Candle coverage per instrument (aggregation) ---------------------------------------------
SELECT i.symbol, i.is_synthetic, COUNT(*) AS candles, MIN(c.trade_date) AS first_day, MAX(c.trade_date) AS last_day
  FROM instruments i JOIN candles c ON c.instrument_id = i.id GROUP BY i.id, i.symbol, i.is_synthetic;

-- 8. Functional dependency check: (instrument, timeframe, date) is a key -> no duplicates --------
SELECT instrument_id, timeframe, trade_date, COUNT(*) FROM candles
 GROUP BY instrument_id, timeframe, trade_date HAVING COUNT(*) > 1;           -- returns 0 rows

-- 9. Query optimisation: EXPLAIN shows which index is used -------------------------------------------
EXPLAIN SELECT * FROM candles
 WHERE instrument_id = 1 AND timeframe = '1d' AND trade_date BETWEEN '2022-01-01' AND '2022-06-30';
EXPLAIN SELECT * FROM backtest_runs WHERE instrument_id = 1 ORDER BY created_at DESC;
-- compare with a query that cannot use an index (function on the column):
EXPLAIN SELECT * FROM candles WHERE YEAR(trade_date) = 2022;

-- 10. Integrity constraints in action (each statement is REJECTED; run them one by one) ------------
INSERT INTO candles (instrument_id, trade_date, open, high, low, close, volume)
VALUES (999999, '2024-01-02', 10, 11, 9, 10, 100);                       -- FK violation (1452)
INSERT INTO instruments (symbol) VALUES ('SYNTH-TREND');                  -- UNIQUE violation (1062) if the demo data is loaded
INSERT INTO candles (instrument_id, trade_date, open, high, low, close, volume)
SELECT id, '2024-01-02', 10, 5, 9, 10, 100 FROM instruments LIMIT 1;      -- CHECK violation: high < low (3819)
INSERT INTO candles (instrument_id, trade_date, open, high, low, close, volume)
SELECT id, '2099-01-01', 10, 11, 9, 10, 100 FROM instruments LIMIT 1;     -- trigger: "candle date is in the future" (1644)

-- 11. Stored function and procedure with cursor ---------------------------------------------------
SELECT fn_return_pct(100000, 125000) AS return_pct, fn_return_pct(0, 5) AS division_guard;
CALL sp_verify_run_integrity((SELECT MAX(id) FROM backtest_runs), @ok, @msg);
SELECT @ok AS consistent, @msg AS message;

-- 12. Transactions: ROLLBACK undoes everything, COMMIT makes it durable --------------------------------
START TRANSACTION;
INSERT INTO instruments (symbol, name) VALUES ('TXN-DEMO', 'temporary');
SELECT COUNT(*) AS inside_transaction FROM instruments WHERE symbol = 'TXN-DEMO';   -- 1
ROLLBACK;
SELECT COUNT(*) AS after_rollback FROM instruments WHERE symbol = 'TXN-DEMO';       -- 0

-- 13. Locking (open two MySQL sessions) -----------------------------------------------------------------
--   Session A:  START TRANSACTION; SELECT * FROM instruments WHERE id = 1 FOR UPDATE;
--   Session B:  UPDATE instruments SET name = 'x' WHERE id = 1;     -- WAITS until A commits/rolls back
--   Session A:  COMMIT;                                              -- B continues
-- Deadlock demo (automatic): python -m scripts.demo_concurrency

-- 14. Isolation level ---------------------------------------------------------------------------------------
SELECT @@transaction_isolation;          -- REPEATABLE-READ

-- 15. Security: accounts and privileges ---------------------------------------------------------------------
SHOW GRANTS FOR 'pbe_app'@'%';           -- SELECT, INSERT, UPDATE, DELETE, EXECUTE only
SHOW GRANTS FOR 'pbe_readonly'@'%';      -- SELECT only
-- Connected as pbe_app:   DROP TABLE trades;   -> ERROR 1142 command denied
-- Connected as pbe_readonly: DELETE FROM instruments; -> ERROR 1142 command denied
