from __future__ import annotations

from typing import Dict, List, Optional, Tuple
from datetime import datetime
import os
import requests


def _cfg() -> Tuple[Optional[str], Optional[str], str]:
    token = os.getenv("OANDA_API_TOKEN")
    account = os.getenv("OANDA_ACCOUNT_ID")
    env = (os.getenv("OANDA_ENV") or "practice").strip().lower()
    if env not in {"practice", "live"}:
        env = "practice"
    return token, account, env


def is_configured() -> bool:
    token, _account, _env = _cfg()
    return bool(token)


def _base_url(env: str) -> str:
    return "https://api-fxpractice.oanda.com" if env == "practice" else "https://api-fxtrade.oanda.com"


def _instrument_to_oanda(instrument: str) -> Optional[str]:
    s = (instrument or "").strip().upper()
    if not s:
        return None
    if "/" in s:
        base, quote = s.split("/", 1)
        base = base.strip()
        quote = quote.strip()
        if len(base) != 3 or len(quote) != 3:
            return None
        return f"{base}_{quote}"
    if "_" in s:
        base, quote = s.split("_", 1)
        if len(base) == 3 and len(quote) == 3:
            return f"{base}_{quote}"
    if len(s) == 6 and s.isalpha():
        return f"{s[:3]}_{s[3:]}"
    return None


def _iso_to_unix_seconds(ts: str) -> Optional[int]:
    try:
        # Example: 2026-02-17T20:45:00.000000000Z
        t = ts.replace("Z", "+00:00")
        # strip nanoseconds if present
        if "." in t:
            head, tail = t.split(".", 1)
            # keep microseconds only
            frac = tail.split("+", 1)[0]
            tz = "+" + tail.split("+", 1)[1] if "+" in tail else ""
            frac = (frac + "000000")[:6]
            t = f"{head}.{frac}{tz}"
        dt = datetime.fromisoformat(t)
        return int(dt.timestamp())
    except Exception:
        return None


def fetch_candles(instrument: str, timeframe: str = "5m", limit: int = 200) -> List[Dict]:
    token, _account, env = _cfg()
    if not token:
        return []

    gran = (timeframe or "").strip().lower()
    gran_map = {"5m": "M5", "15m": "M15", "1h": "H1", "1m": "M1", "1d": "D"}
    if gran not in gran_map:
        return []

    inst = _instrument_to_oanda(instrument)
    if not inst:
        return []

    url = f"{_base_url(env)}/v3/instruments/{inst}/candles"
    params = {"granularity": gran_map[gran], "count": int(limit), "price": "M"}
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(url, params=params, headers=headers, timeout=12)
    if r.status_code != 200:
        return []
    try:
        data = r.json()
    except Exception:
        return []

    candles = data.get("candles") or []
    out: List[Dict] = []
    for c in candles:
        if not isinstance(c, dict):
            continue
        if not c.get("complete"):
            # keep incomplete as it still moves during the bar
            pass
        t = _iso_to_unix_seconds(str(c.get("time") or ""))
        mid = c.get("mid") or {}
        try:
            o = float(mid.get("o"))
            h = float(mid.get("h"))
            l = float(mid.get("l"))
            cl = float(mid.get("c"))
        except Exception:
            continue
        if not t:
            continue
        v = float(c.get("volume") or 0)
        out.append({"time": int(t), "open": o, "high": h, "low": l, "close": cl, "volume": v})
    return out


def fetch_price(instrument: str) -> Optional[float]:
    token, account, env = _cfg()
    if not token or not account:
        return None

    inst = _instrument_to_oanda(instrument)
    if not inst:
        return None

    url = f"{_base_url(env)}/v3/accounts/{account}/pricing"
    params = {"instruments": inst}
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(url, params=params, headers=headers, timeout=10)
    if r.status_code != 200:
        return None
    try:
        data = r.json()
        prices = data.get("prices") or []
        if not prices:
            return None
        p0 = prices[0]
        bids = p0.get("bids") or []
        asks = p0.get("asks") or []
        if bids and asks:
            bid = float(bids[0].get("price"))
            ask = float(asks[0].get("price"))
            return (bid + ask) / 2
        # fallback
        closeout = p0.get("closeoutBid")
        if closeout:
            return float(closeout)
    except Exception:
        return None
    return None
