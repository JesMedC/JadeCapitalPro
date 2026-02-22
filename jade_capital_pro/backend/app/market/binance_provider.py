from __future__ import annotations

from typing import Dict, List, Optional, Tuple
import requests


BINANCE_BASE = "https://api.binance.com"


_SUPPORTED_INTERVALS = {
    "1m",
    "3m",
    "5m",
    "15m",
    "30m",
    "1h",
    "2h",
    "4h",
    "6h",
    "8h",
    "12h",
    "1d",
}


def _interval_to_binance(expiry_time: str) -> str:
    s = (expiry_time or "").strip().lower()
    # expect formats like 1m, 5m, 15m
    if s.endswith("m") and s[:-1].isdigit():
        return f"{int(s[:-1])}m"
    return "5m"


def _instrument_to_symbol(instrument: str) -> Optional[str]:
    inst = (instrument or "").strip().upper()
    if not inst:
        return None

    # Common normalization
    inst = inst.replace(" ", "")

    if "/" in inst:
        base, quote = inst.split("/", 1)
        if quote == "USD":
            quote = "USDT"
        return f"{base}{quote}"

    return inst


def _fetch_klines(symbol: str, interval: str, limit: int) -> List[Dict]:
    url = f"{BINANCE_BASE}/api/v3/klines"
    params = {"symbol": symbol, "interval": interval, "limit": int(limit)}
    r = requests.get(url, params=params, timeout=10)
    if r.status_code != 200:
        return []
    data = r.json()
    out: List[Dict] = []
    for row in data:
        # [openTime, open, high, low, close, volume, closeTime, ...]
        t = int(row[0]) // 1000
        out.append(
            {
                "time": t,
                "open": float(row[1]),
                "high": float(row[2]),
                "low": float(row[3]),
                "close": float(row[4]),
                "volume": float(row[5]),
            }
        )
    return out


def _resample_minutes(candles_1m: List[Dict], minutes: int, limit: int) -> List[Dict]:
    if minutes <= 1:
        return candles_1m[-limit:]
    step = int(minutes) * 60
    buckets: Dict[int, Dict] = {}
    for c in candles_1m:
        t = int(c.get("time", 0))
        if t <= 0:
            continue
        b = (t // step) * step
        o = float(c.get("open", 0.0))
        h = float(c.get("high", 0.0))
        l = float(c.get("low", 0.0))
        cl = float(c.get("close", 0.0))
        v = float(c.get("volume", 0.0) or 0.0)
        if b not in buckets:
            buckets[b] = {"time": b, "open": o, "high": h, "low": l, "close": cl, "volume": v}
        else:
            bb = buckets[b]
            bb["high"] = max(float(bb.get("high", h)), h)
            bb["low"] = min(float(bb.get("low", l)), l)
            bb["close"] = cl
            bb["volume"] = float(bb.get("volume", 0.0) or 0.0) + v

    times = sorted(buckets.keys())
    out = [buckets[t] for t in times]
    return out[-limit:]


def fetch_candles(instrument: str, expiry_time: str, limit: int = 200) -> List[Dict]:
    symbol = _instrument_to_symbol(instrument)
    if not symbol:
        return []

    interval = _interval_to_binance(expiry_time)
    if interval in _SUPPORTED_INTERVALS:
        return _fetch_klines(symbol=symbol, interval=interval, limit=int(limit))

    # Non-binance interval (e.g. 10m): resample from 1m.
    s = (expiry_time or "").strip().lower()
    if s.endswith("m") and s[:-1].isdigit():
        minutes = int(s[:-1])
        base = _fetch_klines(symbol=symbol, interval="1m", limit=int(limit) * max(1, minutes))
        return _resample_minutes(base, minutes=minutes, limit=int(limit))

    # fallback
    return _fetch_klines(symbol=symbol, interval="5m", limit=int(limit))


def fetch_price(instrument: str) -> Optional[float]:
    symbol = _instrument_to_symbol(instrument)
    if not symbol:
        return None
    url = f"{BINANCE_BASE}/api/v3/ticker/price"
    params = {"symbol": symbol}
    r = requests.get(url, params=params, timeout=10)
    if r.status_code != 200:
        return None
    try:
        data = r.json()
        return float(data.get("price"))
    except Exception:
        return None
