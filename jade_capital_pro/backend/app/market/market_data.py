from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from . import oanda_provider
from . import yahoo_provider
from . import twelvedata_provider
from . import binance_provider


_price_cache: dict[str, tuple[float, float, str]] = {}
_candles_cache: dict[str, tuple[float, list[Dict], str]] = {}


def fetch_candles(instrument: str, timeframe: str, limit: int = 200) -> Tuple[List[Dict], str]:
    """Return (candles, provider_name)."""

    # Prefer OANDA for FX if configured.
    if oanda_provider.is_configured():
        c = oanda_provider.fetch_candles(instrument=instrument, timeframe=timeframe, limit=limit)
        if c:
            return c, "oanda"

    cache_key = f"yh:{instrument}:{timeframe}:{int(limit)}"
    now = __import__("time").time()
    cached = _candles_cache.get(cache_key)
    ttl = 10 if str(timeframe).lower() in {"5m", "1m"} else 120
    if cached and (now - cached[0] <= ttl):
        return list(cached[1]), str(cached[2])

    c = yahoo_provider.fetch_candles(instrument=instrument, timeframe=timeframe, limit=limit)
    if c:
        _candles_cache[cache_key] = (now, c, "yahoo")
        return c, "yahoo"

    # Free fallback for FX.
    cache_key = f"td:{instrument}:{timeframe}:{int(limit)}"
    now = __import__("time").time()
    cached = _candles_cache.get(cache_key)
    ttl = 8 if str(timeframe).lower() in {"5m", "1m"} else 60
    if cached and (now - cached[0] <= ttl):
        return list(cached[1]), str(cached[2])

    c = twelvedata_provider.fetch_candles(instrument=instrument, timeframe=timeframe, limit=limit)
    if c:
        _candles_cache[cache_key] = (now, c, "twelvedata")
        return c, "twelvedata"

    # Crypto fallback.
    c = binance_provider.fetch_candles(instrument=instrument, expiry_time=timeframe, limit=limit)
    if c:
        return c, "binance"

    return [], "none"


def fetch_price(instrument: str) -> Tuple[Optional[float], str]:
    if oanda_provider.is_configured():
        p = oanda_provider.fetch_price(instrument=instrument)
        if p is not None:
            return p, "oanda"

    now = __import__("time").time()
    cached = _price_cache.get(instrument)
    if cached and (now - cached[1] <= 3.0):
        return float(cached[0]), str(cached[2])

    p = yahoo_provider.fetch_price(instrument=instrument)
    if p is not None:
        _price_cache[instrument] = (float(p), now, "yahoo")
        return p, "yahoo"

    p = twelvedata_provider.fetch_price(instrument=instrument)
    if p is not None:
        _price_cache[instrument] = (float(p), now, "twelvedata")
        return p, "twelvedata"

    p = binance_provider.fetch_price(instrument=instrument)
    if p is not None:
        return p, "binance"

    return None, "none"
