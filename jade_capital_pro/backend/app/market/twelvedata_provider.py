from __future__ import annotations

from typing import Dict, List, Optional
from datetime import datetime
import os
import requests


TD_BASE = "https://api.twelvedata.com"


def _api_key() -> str:
    # 'demo' works with limited quota.
    return (os.getenv("TWELVEDATA_API_KEY") or "demo").strip() or "demo"


def _interval(tf: str) -> Optional[str]:
    s = (tf or "").strip().lower()
    if s == "5m":
        return "5min"
    if s == "15m":
        return "15min"
    if s == "1h":
        return "1h"
    if s == "1m":
        return "1min"
    if s == "10m":
        return "10min"
    if s == "1d":
        return "1day"
    return None


def _to_unix(dt_str: str) -> Optional[int]:
    try:
        # Example: 2026-02-18 13:50:00
        dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S")
        return int(dt.replace(tzinfo=None).timestamp())
    except Exception:
        return None


def fetch_candles(instrument: str, timeframe: str = "5m", limit: int = 200) -> List[Dict]:
    interval = _interval(timeframe)
    if not interval:
        return []

    url = f"{TD_BASE}/time_series"
    params = {
        "symbol": instrument,
        "interval": interval,
        "outputsize": int(limit),
        "apikey": _api_key(),
        "format": "JSON",
    }
    r = requests.get(url, params=params, timeout=15)
    if r.status_code != 200:
        return []
    try:
        data = r.json()
    except Exception:
        return []

    values = data.get("values")
    if not isinstance(values, list):
        return []

    out: List[Dict] = []
    # TwelveData returns newest-first; reverse to ascending.
    for row in reversed(values):
        if not isinstance(row, dict):
            continue
        t = _to_unix(str(row.get("datetime") or ""))
        if not t:
            continue
        try:
            o = float(row.get("open"))
            h = float(row.get("high"))
            l = float(row.get("low"))
            c = float(row.get("close"))
        except Exception:
            continue
        out.append({"time": int(t), "open": o, "high": h, "low": l, "close": c, "volume": 0.0})
    return out


def fetch_price(instrument: str) -> Optional[float]:
    url = f"{TD_BASE}/price"
    params = {"symbol": instrument, "apikey": _api_key(), "format": "JSON"}
    r = requests.get(url, params=params, timeout=12)
    if r.status_code != 200:
        return None
    try:
        data = r.json()
        p = data.get("price")
        if p is None:
            return None
        return float(p)
    except Exception:
        return None
