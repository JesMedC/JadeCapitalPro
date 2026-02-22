from __future__ import annotations

from typing import Dict, List, Optional
import requests


BITFINEX_BASE = "https://api-pub.bitfinex.com"


def _instrument_to_symbol(instrument: str) -> Optional[str]:
    s = (instrument or "").strip().upper()
    if not s:
        return None
    if "/" in s:
        base, quote = s.split("/", 1)
        base = base.strip()
        quote = quote.strip()
        if len(base) != 3 or len(quote) != 3:
            return None
        return f"t{base}{quote}"
    # Accept EURUSD style.
    if len(s) == 6 and s.isalpha():
        return f"t{s}"
    return None


def fetch_candles(instrument: str, timeframe: str = "5m", limit: int = 200) -> List[Dict]:
    if (timeframe or "").lower() != "5m":
        return []
    sym = _instrument_to_symbol(instrument)
    if not sym:
        return []

    # Bitfinex candles: [MTS, OPEN, CLOSE, HIGH, LOW, VOLUME]
    url = f"{BITFINEX_BASE}/v2/candles/trade:5m:{sym}/hist"
    params = {"limit": int(limit), "sort": 1}
    r = requests.get(url, params=params, timeout=10)
    if r.status_code != 200:
        return []
    try:
        data = r.json()
    except Exception:
        return []
    if not isinstance(data, list):
        return []

    out: List[Dict] = []
    for row in data:
        if not isinstance(row, list) or len(row) < 6:
            continue
        t = int(row[0]) // 1000
        o = float(row[1])
        c = float(row[2])
        h = float(row[3])
        l = float(row[4])
        v = float(row[5])
        out.append({"time": t, "open": o, "high": h, "low": l, "close": c, "volume": v})
    return out


def fetch_price(instrument: str) -> Optional[float]:
    sym = _instrument_to_symbol(instrument)
    if not sym:
        return None
    url = f"{BITFINEX_BASE}/v2/ticker/{sym}"
    r = requests.get(url, timeout=10)
    if r.status_code != 200:
        return None
    try:
        data = r.json()
        # [BID, BID_SIZE, ASK, ASK_SIZE, DAILY_CHANGE, DAILY_CHANGE_RELATIVE, LAST_PRICE, VOLUME, HIGH, LOW]
        if isinstance(data, list) and len(data) >= 7:
            return float(data[6])
    except Exception:
        return None
    return None
