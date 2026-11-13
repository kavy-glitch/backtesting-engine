"""Request / response models (pydantic v2). Validation here happens BEFORE any engine or DB work."""
from __future__ import annotations

from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Strict = ConfigDict(allow_inf_nan=False, extra="forbid")


class SizingIn(BaseModel):
    model_config = Strict
    mode: Literal["percent_equity", "fixed_quantity"] = "percent_equity"
    value: float = Field(100, gt=0, le=1e9)

    @model_validator(mode="after")
    def _pct_cap(self):
        if self.mode == "percent_equity" and self.value > 100:
            raise ValueError("percent_equity size must be between 0 and 100")
        return self


class RunSettings(BaseModel):
    """Everything shared by a single run and a strategy comparison."""
    model_config = Strict
    instrument_id: int = Field(gt=0)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    initial_capital: float = Field(100000, gt=0, le=1e12)
    position_sizing: SizingIn = SizingIn()
    fee_pct: float = Field(0, ge=0, lt=100)
    fee_flat: float = Field(0, ge=0, le=1e9)
    slippage_bps: float = Field(0, ge=0, le=2000)
    stop_loss_pct: Optional[float] = Field(None, gt=0, lt=100)
    take_profit_pct: Optional[float] = Field(None, gt=0, le=1000)
    risk_free_rate: float = Field(0, ge=0, lt=1)
    allow_fractional: bool = False

    @model_validator(mode="after")
    def _dates(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must not be before start_date")
        return self


class BacktestIn(RunSettings):
    strategy_type: str = Field(min_length=1, max_length=40)
    params: dict[str, float] = Field(default_factory=dict)
    name: Optional[str] = Field(None, max_length=120)
    saved_strategy_id: Optional[int] = Field(None, gt=0)

    @field_validator("params")
    @classmethod
    def _finite(cls, v):
        for k, x in v.items():
            if x != x or x in (float("inf"), float("-inf")):
                raise ValueError(f"parameter {k} must be finite")
        return v


class StrategySpec(BaseModel):
    model_config = Strict
    strategy_type: str = Field(min_length=1, max_length=40)
    params: dict[str, float] = Field(default_factory=dict)


class CompareIn(RunSettings):
    strategies: list[StrategySpec] = Field(min_length=1, max_length=6)


class InstrumentIn(BaseModel):
    model_config = Strict
    symbol: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9.^_=\-]+$")
    name: Optional[str] = Field(None, max_length=120)
    exchange: Optional[str] = Field(None, max_length=20)
    currency: str = Field("INR", min_length=3, max_length=3)
    asset_class: Literal["equity", "index", "crypto", "other"] = "equity"

    @field_validator("symbol")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("currency")
    @classmethod
    def _cur(cls, v: str) -> str:
        return v.upper()


class FetchIn(BaseModel):
    model_config = Strict
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def _order(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date must not be before start_date")
        if (self.end_date - self.start_date).days > 366 * 30:
            raise ValueError("date range is too large (maximum 30 years)")
        return self


class FetchSymbolIn(FetchIn):
    symbol: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9.^_=\-]+$")
    name: Optional[str] = Field(None, max_length=120)
    currency: str = Field("INR", min_length=3, max_length=3)
    asset_class: Literal["equity", "index", "crypto", "other"] = "equity"


class SavedStrategyIn(BaseModel):
    model_config = Strict
    name: str = Field(min_length=1, max_length=80)
    strategy_type: str = Field(min_length=1, max_length=40)
    params: dict[str, float] = Field(default_factory=dict)

    @field_validator("name")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name must not be blank")
        return v
