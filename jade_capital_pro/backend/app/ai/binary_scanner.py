from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple


def _sma(values: List[float], period: int) -> List[Optional[float]]:
    if period <= 0:
        return [None for _ in values]
    out: List[Optional[float]] = [None] * len(values)
    s = 0.0
    for i, v in enumerate(values):
        s += v
        if i >= period:
            s -= values[i - period]
        if i >= period - 1:
            out[i] = s / period
    return out


def _ema(values: List[float], period: int) -> List[Optional[float]]:
    if period <= 0:
        return [None for _ in values]
    out: List[Optional[float]] = [None] * len(values)
    k = 2.0 / (period + 1)
    ema: Optional[float] = None
    for i, v in enumerate(values):
        if ema is None:
            ema = v
        else:
            ema = v * k + ema * (1 - k)
        out[i] = ema
    return out


def _stochastic(candles: List[Dict], k_period: int = 5, k_smooth: int = 3, d_period: int = 3) -> Tuple[List[Optional[float]], List[Optional[float]]]:
    highs = [float(c.get("high", 0.0)) for c in candles]
    lows = [float(c.get("low", 0.0)) for c in candles]
    closes = [float(c.get("close", 0.0)) for c in candles]

    raw_k: List[Optional[float]] = [None] * len(candles)
    for i in range(len(candles)):
        if i < k_period - 1:
            continue
        hh = max(highs[i - k_period + 1 : i + 1])
        ll = min(lows[i - k_period + 1 : i + 1])
        if hh == ll:
            raw_k[i] = 50.0
        else:
            raw_k[i] = (closes[i] - ll) / (hh - ll) * 100.0

    # Smooth K
    k_vals = [v if v is not None else 0.0 for v in raw_k]
    k_s = _sma(k_vals, k_smooth)
    d_s = _sma([v if v is not None else 0.0 for v in k_s], d_period)
    return k_s, d_s


def _last_swing(candles: List[Dict], lookback: int = 200) -> Tuple[int, float, int, float]:
    # Returns (low_idx, low, high_idx, high)
    slice_c = candles[-lookback:] if len(candles) > lookback else candles
    lows = [float(c.get("low", 0.0)) for c in slice_c]
    highs = [float(c.get("high", 0.0)) for c in slice_c]

    low = min(lows)
    high = max(highs)
    low_idx = len(candles) - len(slice_c) + lows.index(low)
    high_idx = len(candles) - len(slice_c) + highs.index(high)
    return low_idx, low, high_idx, high


@dataclass
class ScanResult:
    instrument: str
    direction: str  # CALL/PUT
    expiry_time: str
    entry_price: float
    current_price: float
    status: str  # evaluation/confirmed
    reason: str


def scan_binary_setup(
    instrument: str,
    expiry_time: str,
    candles: List[Dict],
) -> Optional[ScanResult]:
    # Requires at least 200 candles for robust scan.
    if len(candles) < 60:
        return None

    candles = candles[-200:]
    closes = [float(c.get("close", 0.0)) for c in candles]
    current = closes[-1]

    ema50 = _ema(closes, 50)[-1]
    ema100 = _ema(closes, 100)[-1]
    ema200 = _ema(closes, 200)[-1]
    if ema50 is None or ema100 is None or ema200 is None:
        return None

    uptrend = ema50 > ema100 > ema200
    downtrend = ema50 < ema100 < ema200
    if not uptrend and not downtrend:
        return None

    k, d = _stochastic(candles, 5, 3, 3)
    if k[-2] is None or k[-1] is None or d[-2] is None or d[-1] is None:
        return None

    # Impulse swing
    low_i, low, high_i, high = _last_swing(candles, 200)
    if high == low:
        return None

    # Identify direction and fib retracement levels
    fibs = [0.618, 0.5, 0.786]
    if uptrend:
        # Need low before high for a clean impulse
        if low_i >= high_i:
            return None
        levels = {r: high - (high - low) * r for r in fibs}
        direction = "CALL"
        # Approaching downward: negative short-term momentum
        approaching = closes[-1] < closes[-2] < closes[-3]
        stoch_ok = (k[-2] < d[-2]) and (k[-1] > d[-1]) and (k[-1] <= 30)
        if not approaching or not stoch_ok:
            return None
        # Choose nearest level below current
        candidates = [(r, lvl) for r, lvl in levels.items() if current >= lvl]
        if not candidates:
            return None
        r, entry = min(candidates, key=lambda x: abs(current - x[1]))
        dist = abs(current - entry) / entry
        if dist <= 0.00005:
            return ScanResult(instrument, direction, expiry_time, entry, current, "confirmed", f"Fib {r} confirmado")
        if dist <= 0.0005:
            return ScanResult(instrument, direction, expiry_time, entry, current, "evaluation", f"Fib {r} en aproximacion")
        return None

    # Downtrend
    if high_i >= low_i:
        return None
    levels = {r: low + (high - low) * r for r in fibs}
    direction = "PUT"
    approaching = closes[-1] > closes[-2] > closes[-3]
    stoch_ok = (k[-2] > d[-2]) and (k[-1] < d[-1]) and (k[-1] >= 70)
    if not approaching or not stoch_ok:
        return None
    candidates = [(r, lvl) for r, lvl in levels.items() if current <= lvl]
    if not candidates:
        return None
    r, entry = min(candidates, key=lambda x: abs(current - x[1]))
    dist = abs(current - entry) / entry
    if dist <= 0.00005:
        return ScanResult(instrument, direction, expiry_time, entry, current, "confirmed", f"Fib {r} confirmado")
    if dist <= 0.0005:
        return ScanResult(instrument, direction, expiry_time, entry, current, "evaluation", f"Fib {r} en aproximacion")
    return None
