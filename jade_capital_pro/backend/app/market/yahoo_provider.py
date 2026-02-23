from __future__ import annotations

from typing import Dict, List, Optional, Tuple
import requests


YH_BASE = "https://query1.finance.yahoo.com"


def _symbol(instrument: str) -> Optional[str]:
    s = (instrument or "").strip().upper()
    if not s:
        return None
    if "/" in s:
        base, quote = s.split("/", 1)
        base = base.strip()
        quote = quote.strip()
        if len(base) != 3 or len(quote) != 3:
            return None
        return f"{base}{quote}=X"
    if len(s) == 6 and s.isalpha():
        return f"{s}=X"
    if s.endswith("=X"):
        return s
    return None


def _interval(tf: str) -> Optional[str]:
    s = (tf or "").strip().lower()
    if s in {"1m", "5m", "15m", "1h", "1d"}:
        return s
    return None


def _range_for(tf: str, limit: int) -> str:
    # Rough ranges that yield enough samples.
    s = (tf or "").strip().lower()
    if s == "1m":
        return "1d"
    if s == "5m":
        return "5d"
    if s == "15m":
        return "1mo"
    if s == "1h":
        return "3mo"
    return "5d"


def _chart(sym: str, interval: str, rng: str) -> Optional[Dict]:
    url = f"{YH_BASE}/v8/finance/chart/{sym}"
    headers = {"User-Agent": "Mozilla/5.0"}
    r = requests.get(url, params={"interval": interval, "range": rng}, headers=headers, timeout=15)
    if r.status_code != 200:
        return None
    try:
        data = r.json()
    except Exception:
        return None
    return data


def fetch_candles(instrument: str, timeframe: str = "5m", limit: int = 200) -> List[Dict]:
    sym = _symbol(instrument)
    interval = _interval(timeframe)
    if not sym or not interval:
        return []
    data = _chart(sym, interval=interval, rng=_range_for(timeframe, limit))
    if not data:
        return []
    try:
        res = (data.get("chart") or {}).get("result") or []
        if not res:
            return []
        r0 = res[0]
        ts = r0.get("timestamp") or []
        q = ((r0.get("indicators") or {}).get("quote") or [{}])[0]
        opens = q.get("open") or []
        highs = q.get("high") or []
        lows = q.get("low") or []
        closes = q.get("close") or []
        vols = q.get("volume") or []
        out: List[Dict] = []
        for i in range(min(len(ts), len(opens), len(highs), len(lows), len(closes))):
            t = ts[i]
            o = opens[i]
            h = highs[i]
            l = lows[i]
            c = closes[i]
            if t is None or o is None or h is None or l is None or c is None:
                continue
            out.append(
                {
                    "time": int(t),
                    "open": float(o),
                    "high": float(h),
                    "low": float(l),
                    "close": float(c),
                    "volume": float(vols[i] or 0) if i < len(vols) else 0.0,
                }
            )
        return out[-int(limit) :]
    except Exception:
        return []


def fetch_price(instrument: str) -> Optional[float]:
    sym = _symbol(instrument)
    if not sym:
        return None
    data = _chart(sym, interval="1m", rng="1d")
    if not data:
        return None
    try:
        res = (data.get("chart") or {}).get("result") or []
        if not res:
            return None
        meta = (res[0] or {}).get("meta") or {}
        p = meta.get("regularMarketPrice")
        if p is not None:
            return float(p)
        q = ((res[0].get("indicators") or {}).get("quote") or [{}])[0]
        closes = q.get("close") or []
        for v in reversed(closes):
            if v is not None:
                return float(v)
    except Exception:
        return None
    return None
