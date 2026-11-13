"""Market-data providers. The API depends on the MarketDataProvider interface, so tests (and an
offline demo) can swap the real Yahoo Finance client for a stand-in."""
from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date, timedelta


class ProviderError(Exception):
    pass


class MarketDataProvider(ABC):
    name = "provider"

    @abstractmethod
    def fetch_daily(self, symbol: str, start: date, end: date) -> tuple[list[dict], list[str]]:
        """Return (rows, warnings). Rows use the same keys as parsed CSV rows."""


class YahooFinanceProvider(MarketDataProvider):
    """Uses the community `yfinance` package (unofficial; personal / educational use).

    Prices are split- and dividend-ADJUSTED (auto_adjust=True) so corporate actions do not create
    fake price jumps in a backtest. Adjusted values differ from the raw quotes on exchange sites.
    """

    name = "yfinance"

    def fetch_daily(self, symbol: str, start: date, end: date) -> tuple[list[dict], list[str]]:
        try:
            import yfinance as yf  # imported lazily so the API starts even if the package is absent
        except ImportError as exc:  # pragma: no cover
            raise ProviderError("yfinance is not installed") from exc
        try:
            df = yf.Ticker(symbol).history(
                start=start.isoformat(), end=(end + timedelta(days=1)).isoformat(),
                interval="1d", auto_adjust=True, actions=False,
            )
        except Exception as exc:  # network errors, rate limiting, unknown ticker, API changes
            raise ProviderError(f"Yahoo Finance request failed: {exc}") from exc
        if df is None or df.empty:
            raise ProviderError(f"No data returned for '{symbol}' between {start} and {end}. "
                                f"Check the ticker (NSE tickers end in .NS, e.g. RELIANCE.NS) and the dates.")
        warnings: list[str] = []
        rows: list[dict] = []
        dropped = 0
        for ts, rec in df.iterrows():
            ohlc = [rec.get("Open"), rec.get("High"), rec.get("Low"), rec.get("Close")]
            if all(v != v for v in ohlc):  # NaN != NaN: provider placeholder row with no prices
                dropped += 1
                continue
            rows.append({"date": ts.date(), "open": rec.get("Open"), "high": rec.get("High"),
                         "low": rec.get("Low"), "close": rec.get("Close"), "volume": rec.get("Volume"),
                         "_row": len(rows) + 1})
        if dropped:
            warnings.append(f"{dropped} empty placeholder row(s) returned by the provider were skipped.")
        return rows, warnings


def get_provider() -> MarketDataProvider:
    return YahooFinanceProvider()
