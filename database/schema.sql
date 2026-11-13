-- =============================================================================
-- Portfolio Backtesting Engine - MySQL 8 schema (InnoDB)
-- Applied by: docker entrypoint (docker-compose) or backend/scripts/init_db.py
-- The target database is selected by the caller (no CREATE DATABASE / USE here).
--
-- Conventions
--   * TIMESTAMP columns are UTC (the backend sets the session time zone to +00:00).
--   * DATE columns hold the exchange-local calendar date of a daily candle.
--   * Configuration money uses DECIMAL. Engine OUTPUT (equity, P&L, ratios) uses DOUBLE so
--     the stored value is bit-identical to what the engine returned and exports match the UI.
--   * Every statement is idempotent (IF NOT EXISTS / DROP IF EXISTS) so the script can be re-run.
-- =============================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------- instruments
CREATE TABLE IF NOT EXISTS instruments (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  symbol        VARCHAR(32)  NOT NULL,
  name          VARCHAR(120) NULL,
  exchange      VARCHAR(20)  NULL,
  currency      CHAR(3)      NOT NULL DEFAULT 'INR',
  asset_class   ENUM('equity','index','crypto','other') NOT NULL DEFAULT 'equity',
  is_synthetic  BOOLEAN      NOT NULL DEFAULT FALSE,   -- TRUE = generated demo data, never real prices
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_instruments_symbol UNIQUE (symbol),
  CONSTRAINT ck_instruments_symbol CHECK (CHAR_LENGTH(TRIM(symbol)) > 0)
) ENGINE=InnoDB;

-- -------------------------------------------------------------- import batches
CREATE TABLE IF NOT EXISTS import_batches (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  instrument_id  INT UNSIGNED NOT NULL,
  source         ENUM('yfinance','csv','synthetic_sample') NOT NULL,
  file_name      VARCHAR(255) NULL,
  rows_received  INT UNSIGNED NOT NULL,
  rows_inserted  INT UNSIGNED NOT NULL,
  rows_updated   INT UNSIGNED NOT NULL DEFAULT 0,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_batches_instrument FOREIGN KEY (instrument_id)
    REFERENCES instruments (id) ON DELETE CASCADE,
  INDEX idx_batches_instrument_time (instrument_id, created_at)
) ENGINE=InnoDB;

-- --------------------------------------------------------------------- candles
-- Natural composite key: one row per instrument + timeframe + date => duplicates are impossible.
CREATE TABLE IF NOT EXISTS candles (
  instrument_id INT UNSIGNED NOT NULL,
  timeframe     ENUM('1d')   NOT NULL DEFAULT '1d',
  trade_date    DATE         NOT NULL,
  open          DECIMAL(20,6) NOT NULL,
  high          DECIMAL(20,6) NOT NULL,
  low           DECIMAL(20,6) NOT NULL,
  close         DECIMAL(20,6) NOT NULL,
  volume        DECIMAL(30,6) NOT NULL,
  batch_id      INT UNSIGNED NULL,
  PRIMARY KEY (instrument_id, timeframe, trade_date),
  CONSTRAINT fk_candles_instrument FOREIGN KEY (instrument_id)
    REFERENCES instruments (id) ON DELETE CASCADE,
  CONSTRAINT fk_candles_batch FOREIGN KEY (batch_id)
    REFERENCES import_batches (id) ON DELETE SET NULL,
  CONSTRAINT ck_candles_positive CHECK (open > 0 AND high > 0 AND low > 0 AND close > 0 AND volume >= 0),
  CONSTRAINT ck_candles_ohlc CHECK (high >= low AND high >= open AND high >= close
                                    AND low <= open AND low <= close)
) ENGINE=InnoDB;

-- ------------------------------------------------------------- strategy catalogue
-- Synchronised from the C++ engine (`engine --list-strategies`) when the API starts, so the
-- engine remains the single source of truth for strategies and parameter limits.
CREATE TABLE IF NOT EXISTS strategy_types (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type_key    VARCHAR(40)  NOT NULL,
  name        VARCHAR(80)  NOT NULL,
  description VARCHAR(500) NOT NULL,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_strategy_types_key UNIQUE (type_key)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS strategy_param_specs (
  strategy_type_id INT UNSIGNED NOT NULL,
  param_key        VARCHAR(40)  NOT NULL,
  label            VARCHAR(80)  NOT NULL,
  default_value    DOUBLE       NOT NULL,
  min_value        DOUBLE       NOT NULL,
  max_value        DOUBLE       NOT NULL,
  is_integer       BOOLEAN      NOT NULL,
  PRIMARY KEY (strategy_type_id, param_key),
  CONSTRAINT fk_specs_type FOREIGN KEY (strategy_type_id)
    REFERENCES strategy_types (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------- saved strategies
CREATE TABLE IF NOT EXISTS saved_strategies (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name             VARCHAR(80) NOT NULL,
  strategy_type_id INT UNSIGNED NOT NULL,
  created_at       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_saved_strategies_name UNIQUE (name),
  CONSTRAINT ck_saved_strategies_name CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT fk_saved_strategies_type FOREIGN KEY (strategy_type_id)
    REFERENCES strategy_types (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Parameters are rows, not a JSON blob: each fact is atomic (1NF) and depends on the full key.
CREATE TABLE IF NOT EXISTS saved_strategy_params (
  saved_strategy_id INT UNSIGNED NOT NULL,
  param_key         VARCHAR(40)  NOT NULL,
  param_value       DOUBLE       NOT NULL,
  PRIMARY KEY (saved_strategy_id, param_key),
  CONSTRAINT fk_ssp_strategy FOREIGN KEY (saved_strategy_id)
    REFERENCES saved_strategies (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------------ backtest runs
CREATE TABLE IF NOT EXISTS backtest_runs (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name              VARCHAR(120) NULL,
  instrument_id     INT UNSIGNED NOT NULL,
  strategy_type_id  INT UNSIGNED NOT NULL,
  saved_strategy_id INT UNSIGNED NULL,
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  initial_capital   DECIMAL(18,2) NOT NULL,
  sizing_mode       ENUM('percent_equity','fixed_quantity') NOT NULL,
  sizing_value      DECIMAL(18,4) NOT NULL,
  fee_pct           DECIMAL(8,4)  NOT NULL DEFAULT 0,
  fee_flat          DECIMAL(18,2) NOT NULL DEFAULT 0,
  slippage_bps      DECIMAL(8,2)  NOT NULL DEFAULT 0,
  stop_loss_pct     DECIMAL(8,4)  NULL,
  take_profit_pct   DECIMAL(8,4)  NULL,
  risk_free_rate    DECIMAL(6,4)  NOT NULL DEFAULT 0,
  allow_fractional  BOOLEAN       NOT NULL DEFAULT FALSE,
  engine_version    VARCHAR(20)   NOT NULL,
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- RESTRICT: an instrument or strategy type that has results cannot be deleted by accident.
  CONSTRAINT fk_runs_instrument FOREIGN KEY (instrument_id)
    REFERENCES instruments (id) ON DELETE RESTRICT,
  CONSTRAINT fk_runs_type FOREIGN KEY (strategy_type_id)
    REFERENCES strategy_types (id) ON DELETE RESTRICT,
  CONSTRAINT fk_runs_saved FOREIGN KEY (saved_strategy_id)
    REFERENCES saved_strategies (id) ON DELETE SET NULL,
  CONSTRAINT ck_runs_period CHECK (end_date >= start_date),
  CONSTRAINT ck_runs_capital CHECK (initial_capital > 0),
  CONSTRAINT ck_runs_sizing CHECK (sizing_value > 0),
  CONSTRAINT ck_runs_costs CHECK (fee_pct >= 0 AND fee_pct < 100 AND fee_flat >= 0 AND slippage_bps >= 0),
  INDEX idx_runs_instrument_created (instrument_id, created_at),
  INDEX idx_runs_type (strategy_type_id),
  INDEX idx_runs_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS backtest_run_params (
  run_id      INT UNSIGNED NOT NULL,
  param_key   VARCHAR(40)  NOT NULL,
  param_value DOUBLE       NOT NULL,
  PRIMARY KEY (run_id, param_key),
  CONSTRAINT fk_brp_run FOREIGN KEY (run_id) REFERENCES backtest_runs (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 1:1 with backtest_runs (shared primary key). NULL = "not computable", explained in `notes`.
-- DELIBERATE DENORMALISATION: `notes` is a JSON document of display-only explanations
-- (metric name -> reason it is null). It is never queried by key, so a child table adds nothing.
CREATE TABLE IF NOT EXISTS backtest_metrics (
  run_id                INT UNSIGNED PRIMARY KEY,
  final_equity          DOUBLE NOT NULL,
  net_profit            DOUBLE NOT NULL,
  total_return_pct      DOUBLE NOT NULL,
  realized_pnl          DOUBLE NOT NULL,
  unrealized_pnl        DOUBLE NOT NULL,
  total_fees            DOUBLE NOT NULL,
  max_drawdown_pct      DOUBLE NOT NULL,
  exposure_pct          DOUBLE NOT NULL,
  closed_trades         INT UNSIGNED NOT NULL,
  winning_trades        INT UNSIGNED NOT NULL,
  losing_trades         INT UNSIGNED NOT NULL,
  breakeven_trades      INT UNSIGNED NOT NULL,
  win_rate_pct          DOUBLE NULL,
  avg_trade_return_pct  DOUBLE NULL,
  avg_win               DOUBLE NULL,
  avg_loss              DOUBLE NULL,
  profit_factor         DOUBLE NULL,
  sharpe_ratio          DOUBLE NULL,
  sortino_ratio         DOUBLE NULL,
  annual_volatility_pct DOUBLE NULL,
  cagr_pct              DOUBLE NULL,
  buy_hold_return_pct   DOUBLE NOT NULL,
  buy_hold_final_equity DOUBLE NOT NULL,
  notes                 JSON   NOT NULL,
  CONSTRAINT fk_metrics_run FOREIGN KEY (run_id) REFERENCES backtest_runs (id) ON DELETE CASCADE,
  CONSTRAINT ck_metrics_trade_counts CHECK (winning_trades + losing_trades + breakeven_trades = closed_trades),
  CONSTRAINT ck_metrics_dd CHECK (max_drawdown_pct >= 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------- trades
-- The instrument is NOT repeated here: it is reachable through run_id (3NF).
CREATE TABLE IF NOT EXISTS trades (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  run_id        INT UNSIGNED NOT NULL,
  trade_no      INT UNSIGNED NOT NULL,
  direction     ENUM('LONG') NOT NULL DEFAULT 'LONG',
  status        ENUM('closed','open') NOT NULL,
  entry_date    DATE NOT NULL,
  exit_date     DATE NOT NULL,       -- for an open trade: the last bar (mark-to-market date)
  entry_price   DOUBLE NOT NULL,
  exit_price    DOUBLE NOT NULL,     -- for an open trade: the last close
  quantity      DOUBLE NOT NULL,
  entry_fee     DOUBLE NOT NULL,
  exit_fee      DOUBLE NOT NULL,
  gross_pnl     DOUBLE NOT NULL,
  net_pnl       DOUBLE NOT NULL,
  return_pct    DOUBLE NOT NULL,
  holding_days  INT UNSIGNED NOT NULL,
  exit_reason   ENUM('signal','stop_loss','take_profit','open') NOT NULL,
  CONSTRAINT uq_trades_run_no UNIQUE (run_id, trade_no),
  CONSTRAINT fk_trades_run FOREIGN KEY (run_id) REFERENCES backtest_runs (id) ON DELETE CASCADE,
  CONSTRAINT ck_trades_qty CHECK (quantity > 0 AND entry_price > 0 AND exit_price > 0),
  CONSTRAINT ck_trades_dates CHECK (exit_date >= entry_date),
  INDEX idx_trades_run_entry (run_id, entry_date),
  INDEX idx_trades_run_pnl (run_id, net_pnl)
) ENGINE=InnoDB;

-- --------------------------------------------------------------- equity snapshots
CREATE TABLE IF NOT EXISTS equity_points (
  run_id           INT UNSIGNED NOT NULL,
  point_date       DATE NOT NULL,
  equity           DOUBLE NOT NULL,
  cash             DOUBLE NOT NULL,
  position_value   DOUBLE NOT NULL,
  drawdown_pct     DOUBLE NOT NULL,
  benchmark_equity DOUBLE NOT NULL,
  PRIMARY KEY (run_id, point_date),
  CONSTRAINT fk_equity_run FOREIGN KEY (run_id) REFERENCES backtest_runs (id) ON DELETE CASCADE,
  CONSTRAINT ck_equity_dd CHECK (drawdown_pct <= 0)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------- indicator series
-- Split in two so `panel` depends on the series (not on the series+date key): 2NF/3NF.
CREATE TABLE IF NOT EXISTS indicator_series (
  id     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  run_id INT UNSIGNED NOT NULL,
  name   VARCHAR(40) NOT NULL,
  panel  ENUM('overlay','rsi','macd') NOT NULL,
  CONSTRAINT uq_indicator_series UNIQUE (run_id, name),
  CONSTRAINT fk_series_run FOREIGN KEY (run_id) REFERENCES backtest_runs (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS indicator_values (
  series_id  INT UNSIGNED NOT NULL,
  point_date DATE NOT NULL,
  value      DOUBLE NOT NULL,      -- warm-up days (undefined values) are simply not stored
  PRIMARY KEY (series_id, point_date),
  CONSTRAINT fk_values_series FOREIGN KEY (series_id) REFERENCES indicator_series (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------- warnings / rejected orders
CREATE TABLE IF NOT EXISTS run_messages (
  id      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  run_id  INT UNSIGNED NOT NULL,
  kind    ENUM('warning','rejected_order') NOT NULL,
  message VARCHAR(500) NOT NULL,
  CONSTRAINT fk_messages_run FOREIGN KEY (run_id) REFERENCES backtest_runs (id) ON DELETE CASCADE,
  INDEX idx_messages_run (run_id)
) ENGINE=InnoDB;

-- =============================================================================
-- Stored function, procedure (with cursor), triggers, views
-- =============================================================================
DELIMITER $$

DROP FUNCTION IF EXISTS fn_return_pct$$
CREATE FUNCTION fn_return_pct(p_initial DOUBLE, p_final DOUBLE)
RETURNS DOUBLE
DETERMINISTIC NO SQL
BEGIN
  IF p_initial IS NULL OR p_final IS NULL OR p_initial <= 0 THEN
    RETURN NULL;
  END IF;
  RETURN (p_final / p_initial - 1) * 100;
END$$

-- Integrity audit: walks the trades of a run with a CURSOR and checks that they agree with the
-- stored metrics (sum of closed net P&L = realized P&L, trade count = closed_trades).
DROP PROCEDURE IF EXISTS sp_verify_run_integrity$$
CREATE PROCEDURE sp_verify_run_integrity(IN p_run_id INT UNSIGNED,
                                         OUT p_consistent BOOLEAN,
                                         OUT p_message VARCHAR(255))
READS SQL DATA
BEGIN
  DECLARE v_done     INT DEFAULT 0;
  DECLARE v_pnl      DOUBLE;
  DECLARE v_sum      DOUBLE DEFAULT 0;
  DECLARE v_count    INT DEFAULT 0;
  DECLARE v_realized DOUBLE DEFAULT NULL;
  DECLARE v_closed   INT DEFAULT NULL;
  DECLARE c_trades CURSOR FOR
    SELECT net_pnl FROM trades WHERE run_id = p_run_id AND status = 'closed';
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

  SELECT realized_pnl, closed_trades INTO v_realized, v_closed
    FROM backtest_metrics WHERE run_id = p_run_id;
  SET v_done = 0;

  IF v_closed IS NULL THEN
    SET p_consistent = FALSE, p_message = 'run not found';
  ELSE
    OPEN c_trades;
    read_loop: LOOP
      FETCH c_trades INTO v_pnl;
      IF v_done = 1 THEN LEAVE read_loop; END IF;
      SET v_sum = v_sum + v_pnl, v_count = v_count + 1;
    END LOOP;
    CLOSE c_trades;
    IF v_count = v_closed AND ABS(v_sum - v_realized) < 0.000001 THEN
      SET p_consistent = TRUE, p_message = 'trades agree with stored metrics';
    ELSE
      SET p_consistent = FALSE,
          p_message = CONCAT('mismatch: ', v_count, ' trades summing to ', v_sum,
                             ' vs metrics ', v_closed, ' trades / ', v_realized);
    END IF;
  END IF;
END$$

-- A CHECK constraint cannot call UTC_DATE() (non-deterministic), so the "no candles from the
-- future" rule is enforced with triggers.
DROP TRIGGER IF EXISTS trg_candles_bi$$
CREATE TRIGGER trg_candles_bi BEFORE INSERT ON candles FOR EACH ROW
BEGIN
  IF NEW.trade_date > DATE_ADD(UTC_DATE(), INTERVAL 1 DAY) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'candle date is in the future';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_candles_bu$$
CREATE TRIGGER trg_candles_bu BEFORE UPDATE ON candles FOR EACH ROW
BEGIN
  IF NEW.trade_date > DATE_ADD(UTC_DATE(), INTERVAL 1 DAY) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'candle date is in the future';
  END IF;
END$$

DELIMITER ;

CREATE OR REPLACE VIEW v_run_summary AS
SELECT r.id              AS run_id,
       r.name            AS run_name,
       i.symbol          AS symbol,
       i.is_synthetic    AS is_synthetic,
       st.type_key       AS strategy_type,
       st.name           AS strategy_name,
       r.start_date, r.end_date, r.initial_capital,
       m.final_equity, m.net_profit,
       fn_return_pct(r.initial_capital, m.final_equity) AS total_return_pct,
       m.max_drawdown_pct, m.sharpe_ratio, m.win_rate_pct, m.closed_trades,
       m.buy_hold_return_pct, r.created_at
  FROM backtest_runs r
  JOIN instruments i     ON i.id  = r.instrument_id
  JOIN strategy_types st ON st.id = r.strategy_type_id
  JOIN backtest_metrics m ON m.run_id = r.id;

CREATE OR REPLACE VIEW v_trade_detail AS
SELECT t.*, i.symbol AS symbol, st.type_key AS strategy_type
  FROM trades t
  JOIN backtest_runs r   ON r.id  = t.run_id
  JOIN instruments i     ON i.id  = r.instrument_id
  JOIN strategy_types st ON st.id = r.strategy_type_id;
