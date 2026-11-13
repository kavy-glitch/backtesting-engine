-- Runs automatically when the MySQL container first starts
-- (docker-entrypoint-initdb.d executes this against the MYSQL_DATABASE
-- database created from docker/.env, so no CREATE DATABASE/USE needed here)

CREATE TABLE IF NOT EXISTS stock_prices (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    symbol      VARCHAR(10)     NOT NULL,
    trade_date  DATE            NOT NULL,
    open        DECIMAL(14,4)   NULL,
    high        DECIMAL(14,4)   NULL,
    low         DECIMAL(14,4)   NULL,
    close       DECIMAL(14,4)   NOT NULL,
    volume      BIGINT UNSIGNED NOT NULL,
    UNIQUE KEY uq_symbol_date (symbol, trade_date),
    INDEX idx_symbol (symbol),
    INDEX idx_trade_date (trade_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;