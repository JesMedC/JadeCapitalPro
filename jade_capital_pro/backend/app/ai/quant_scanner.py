from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import math
from datetime import datetime


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


def _true_range(candles: List[Dict[str, Any]]) -> List[float]:
    trs: List[float] = []
    prev_close: Optional[float] = None
    for c in candles:
        h = float(c.get("high", 0.0))
        l = float(c.get("low", 0.0))
        if prev_close is None:
            tr = h - l
        else:
            tr = max(h - l, abs(h - prev_close), abs(l - prev_close))
        trs.append(float(tr))
        prev_close = float(c.get("close", 0.0))
    return trs


def _atr(candles: List[Dict[str, Any]], period: int = 14) -> List[Optional[float]]:
    return _sma(_true_range(candles), period)


def _rsi(closes: List[float], period: int = 14) -> List[Optional[float]]:
    if period <= 0 or len(closes) < period + 1:
        return [None for _ in closes]

    out: List[Optional[float]] = [None] * len(closes)
    gains = [0.0] * len(closes)
    losses = [0.0] * len(closes)
    for i in range(1, len(closes)):
        ch = closes[i] - closes[i - 1]
        gains[i] = max(0.0, ch)
        losses[i] = max(0.0, -ch)

    avg_g = sum(gains[1 : period + 1]) / period
    avg_l = sum(losses[1 : period + 1]) / period
    rs = (avg_g / avg_l) if avg_l > 0 else float("inf")
    out[period] = 100.0 - (100.0 / (1.0 + rs))

    for i in range(period + 1, len(closes)):
        avg_g = (avg_g * (period - 1) + gains[i]) / period
        avg_l = (avg_l * (period - 1) + losses[i]) / period
        rs = (avg_g / avg_l) if avg_l > 0 else float("inf")
        out[i] = 100.0 - (100.0 / (1.0 + rs))

    return out


def _macd_hist(closes: List[float], fast: int = 12, slow: int = 26, signal: int = 9) -> List[Optional[float]]:
    ema_f = _ema(closes, fast)
    ema_s = _ema(closes, slow)
    macd: List[Optional[float]] = [None] * len(closes)
    for i in range(len(closes)):
        if ema_f[i] is None or ema_s[i] is None:
            macd[i] = None
        else:
            macd[i] = float(ema_f[i] - ema_s[i])

    macd_vals = [m if m is not None else 0.0 for m in macd]
    sig = _ema(macd_vals, signal)
    out: List[Optional[float]] = [None] * len(closes)
    for i in range(len(closes)):
        if macd[i] is None or sig[i] is None:
            out[i] = None
        else:
            out[i] = float(macd[i] - sig[i])
    return out


def _bollinger_width(closes: List[float], period: int = 20, k: float = 2.0) -> List[Optional[float]]:
    out: List[Optional[float]] = [None] * len(closes)
    if period <= 1:
        return out
    for i in range(len(closes)):
        if i < period - 1:
            continue
        w = closes[i - period + 1 : i + 1]
        mean = sum(w) / period
        var = sum((x - mean) ** 2 for x in w) / period
        sd = math.sqrt(var)
        upper = mean + k * sd
        lower = mean - k * sd
        if mean == 0:
            out[i] = None
        else:
            out[i] = float((upper - lower) / mean)
    return out


def _percentile_rank(values: List[float], x: float) -> float:
    v = [float(a) for a in values if math.isfinite(float(a))]
    if not v:
        return 0.0
    v.sort()
    # Rank in [0,1]
    import bisect

    idx = bisect.bisect_right(v, float(x))
    return float(idx) / float(len(v))


def _stochastic_kd(candles: List[Dict[str, Any]], k_period: int = 5, k_smooth: int = 3, d_period: int = 3) -> Tuple[Optional[float], Optional[float]]:
    if len(candles) < k_period + k_smooth + d_period:
        return None, None
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

    def last_sma(vals: List[Optional[float]], period: int) -> Optional[float]:
        if period <= 0:
            return None
        w = [v for v in vals[-period:] if v is not None]
        if len(w) < period:
            return None
        return float(sum(w) / period)

    # Smooth %K
    k_s: List[Optional[float]] = [None] * len(candles)
    for i in range(len(candles)):
        if raw_k[i] is None:
            continue
        w = [raw_k[i - j] for j in range(k_smooth) if i - j >= 0]
        w2 = [v for v in w if v is not None]
        if len(w2) < k_smooth:
            continue
        k_s[i] = float(sum(w2[:k_smooth]) / k_smooth)

    k_last = last_sma(k_s, 1)
    d_last = last_sma(k_s, d_period)
    return k_last, d_last


def scan_test_strategy_ema200_stoch(
    instrument: str,
    expiry_time: str,
    candles_base: List[Dict[str, Any]],
    stoch_k: int = 5,
    stoch_d: int = 3,
    stoch_slowing: int = 3,
    rsi_period: int = 14,
    ema_fast: int = 9,
    ema_slow: int = 21,
    ema_filter: int = 200,
) -> Optional[QuantScanResult]:
    """
    Estrategia configurable que combina EMAs, RSI y Estocástico.
    """
    if len(candles_base) < max(ema_filter + 10, 210):
        return None
    
    c = candles_base[-(max(ema_filter + 50, 300)):]
    closes = [float(x.get("close", 0.0)) for x in c]
    current = float(closes[-1])
    
    # EMAs
    ema_f_val = _ema(closes, ema_fast)[-1]
    ema_s_val = _ema(closes, ema_slow)[-1]
    ema_filter_val = _ema(closes, ema_filter)[-1]
    
    if ema_f_val is None or ema_s_val is None or ema_filter_val is None:
        return None
    
    # RSI
    rsi_vals = _rsi(closes, rsi_period)
    rsi_last = rsi_vals[-1]
    if rsi_last is None:
        return None
        
    # Stochastic
    k, d = _stochastic_kd(c, stoch_k, stoch_slowing, stoch_d)
    if k is None or d is None:
        return None

    direction = None
    reason = None
    
    # Lógica de tendencia + momentum + agotamiento
    # COMPRA (CALL): Tendencia alcista (precio > EMA filtrado), momentum alcista (EMA rápido > EMA lento), y sobreventa (Stoch < 30 o RSI < 40)
    if current > float(ema_filter_val) and float(ema_f_val) > float(ema_s_val):
        if float(k) < 30.0 or float(rsi_last) < 40.0:
            direction = "CALL"
            reason = f"Trend UP, Momentum UP, Oversold (Stoch={k:.1f}, RSI={rsi_last:.1f})"
            
    # VENTA (PUT): Tendencia bajista (precio < EMA filtrado), momentum bajista (EMA rápido < EMA lento), y sobrecompra (Stoch > 70 o RSI > 60)
    elif current < float(ema_filter_val) and float(ema_f_val) < float(ema_s_val):
        if float(k) > 70.0 or float(rsi_last) > 60.0:
            direction = "PUT"
            reason = f"Trend DOWN, Momentum DOWN, Overbought (Stoch={k:.1f}, RSI={rsi_last:.1f})"

    if not direction:
        return None

    last_candle_time = int(c[-1].get("time", 0) or 0)
    meta: Dict[str, Any] = {
        "agent": "jade_custom_strategy_v1",
        "strategy": {
            "name": f"Configurable EMA({ema_fast},{ema_slow},{ema_filter}) + RSI({rsi_period}) + Stoch({stoch_k},{stoch_slowing},{stoch_d})",
            "rule": reason,
            "direction": direction,
        },
        "timeframes": {"base": expiry_time},
        "candle_time": last_candle_time,
        "indicators": {
            "ema_fast": float(ema_f_val),
            "ema_slow": float(ema_s_val),
            "ema_filter": float(ema_filter_val),
            "rsi": float(rsi_last),
            "stoch_k": float(k),
            "stoch_d": float(d),
        },
        "model": {"P1": None, "P2": None, "P_final": None, "trained": False},
    }

    report = "\n".join(
        [
            f"1️⃣ Regimen detectado: {'Alcista' if direction == 'CALL' else 'Bajista'}",
            f"2️⃣ Impulso validado: SI (EMA Fast > EMA Slow)" if direction == "CALL" else "2️⃣ Impulso validado: SI (EMA Fast < EMA Slow)",
            f"3️⃣ Filtro Tendencia: {'Arriba EMA' + str(ema_filter) if direction == 'CALL' else 'Abajo EMA' + str(ema_filter)}",
            f"4️⃣ Agotamiento: {'Stoch/RSI Bajo' if direction == 'CALL' else 'Stoch/RSI Alto'}",
            f"5️⃣ Features clave: ema_f={_fmt(ema_f_val,6)} stoch_k={_fmt(k,2)} rsi={_fmt(rsi_last,2)}",
            "6️⃣ Señal generada por parámetros configurables del usuario.",
            "7️⃣ Expectativa matemática: --",
            "8️⃣ Gestión de riesgo: Estándar",
            f"9️⃣ Razón: {reason}",
        ]
    )
    meta["report_text"] = report

    return QuantScanResult(
        instrument=instrument,
        direction=direction,
        expiry_time=expiry_time,
        entry=float(current),
        status="confirmed",
        report_text=report,
        meta=meta,
    )


def _pivots(candles: List[Dict[str, Any]], w: int = 2) -> List[Tuple[int, str, float]]:
    # Returns (index, kind, price) where kind is 'H' or 'L'
    out: List[Tuple[int, str, float]] = []
    n = len(candles)
    if n < 2 * w + 1:
        return out
    highs = [float(c.get("high", 0.0)) for c in candles]
    lows = [float(c.get("low", 0.0)) for c in candles]
    for i in range(w, n - w):
        h = highs[i]
        l = lows[i]
        if h == max(highs[i - w : i + w + 1]):
            out.append((i, "H", h))
        if l == min(lows[i - w : i + w + 1]):
            out.append((i, "L", l))
    out.sort(key=lambda x: x[0])
    # compress consecutive same-kind pivots
    comp: List[Tuple[int, str, float]] = []
    for idx, kind, price in out:
        if not comp:
            comp.append((idx, kind, price))
            continue
        p_idx, p_kind, p_price = comp[-1]
        if kind != p_kind:
            comp.append((idx, kind, price))
            continue
        # keep the more extreme pivot
        if kind == "H" and price >= p_price:
            comp[-1] = (idx, kind, price)
        elif kind == "L" and price <= p_price:
            comp[-1] = (idx, kind, price)
    return comp


def _adx(candles: List[Dict[str, Any]], period: int = 14) -> Optional[float]:
    # Minimal ADX implementation.
    if len(candles) < period + 2:
        return None
    highs = [float(c.get("high", 0.0)) for c in candles]
    lows = [float(c.get("low", 0.0)) for c in candles]
    closes = [float(c.get("close", 0.0)) for c in candles]
    trs = _true_range(candles)

    plus_dm = [0.0] * len(candles)
    minus_dm = [0.0] * len(candles)
    for i in range(1, len(candles)):
        up = highs[i] - highs[i - 1]
        dn = lows[i - 1] - lows[i]
        plus_dm[i] = up if (up > dn and up > 0) else 0.0
        minus_dm[i] = dn if (dn > up and dn > 0) else 0.0

    # Wilder smoothing
    tr14 = sum(trs[1 : period + 1])
    p14 = sum(plus_dm[1 : period + 1])
    m14 = sum(minus_dm[1 : period + 1])
    if tr14 <= 0:
        return None

    dxs: List[float] = []
    for i in range(period + 1, len(candles)):
        tr14 = tr14 - (tr14 / period) + trs[i]
        p14 = p14 - (p14 / period) + plus_dm[i]
        m14 = m14 - (m14 / period) + minus_dm[i]
        if tr14 <= 0:
            continue
        pdi = 100.0 * (p14 / tr14)
        mdi = 100.0 * (m14 / tr14)
        denom = pdi + mdi
        dx = 0.0 if denom == 0 else 100.0 * abs(pdi - mdi) / denom
        dxs.append(dx)

    if len(dxs) < period:
        return float(sum(dxs) / max(1, len(dxs))) if dxs else None
    # ADX is SMA of DX
    return float(sum(dxs[-period:]) / period)


def _hurst_approx(closes: List[float], window: int = 100) -> Optional[float]:
    # Simple R/S Hurst approximation on log returns.
    if len(closes) < max(20, window):
        return None
    w = closes[-window:]
    rets = []
    for i in range(1, len(w)):
        if w[i - 1] <= 0 or w[i] <= 0:
            rets.append(0.0)
        else:
            rets.append(math.log(w[i] / w[i - 1]))
    if not rets:
        return None
    mean = sum(rets) / len(rets)
    dev = [r - mean for r in rets]
    cum = []
    s = 0.0
    for d in dev:
        s += d
        cum.append(s)
    r = max(cum) - min(cum)
    var = sum(d * d for d in dev) / len(dev)
    sd = math.sqrt(var)
    if sd == 0:
        return None
    rs = r / sd
    if rs <= 0:
        return None
    # H = log(R/S) / log(N)
    return float(math.log(rs) / math.log(len(rets)))


@dataclass
class QuantScanResult:
    instrument: str
    direction: str  # CALL/PUT/--
    expiry_time: str
    entry: float
    status: str  # no_signal | evaluation | confirmed
    report_text: str
    meta: Dict[str, Any]


def _fmt(v: Any, nd: int = 4) -> str:
    try:
        x = float(v)
        if not math.isfinite(x):
            return "--"
        return f"{x:.{nd}f}"
    except Exception:
        return "--"


def scan_quant_binary_setup(
    instrument: str,
    expiry_time: str,
    candles_5m: List[Dict[str, Any]],
    candles_1m: List[Dict[str, Any]],
    candles_15m: List[Dict[str, Any]],
    payout: float = 0.80,
) -> Optional[QuantScanResult]:
    # Deterministic structural scanner. Probabilities are NOT produced until a trained model is integrated.
    if len(candles_5m) < 80:
        return None

    c5 = candles_5m[-200:]
    closes5 = [float(c.get("close", 0.0)) for c in c5]
    current = closes5[-1]
    last_candle_time = int(c5[-1].get("time", 0) or 0)
    atrs = _atr(c5, 14)
    atr_last = atrs[-1] if atrs else None
    if atr_last is None or not math.isfinite(float(atr_last)) or float(atr_last) <= 0:
        return None

    piv = _pivots(c5, 2)
    piv_last = piv[-8:] if len(piv) >= 5 else piv

    # Trend / HH-HL or LH-LL via last two pivot highs and lows.
    highs = [(i, p) for i, k, p in piv_last if k == "H"]
    lows = [(i, p) for i, k, p in piv_last if k == "L"]

    up_hh = len(highs) >= 2 and highs[-1][1] > highs[-2][1]
    up_hl = len(lows) >= 2 and lows[-1][1] > lows[-2][1]
    dn_lh = len(highs) >= 2 and highs[-1][1] < highs[-2][1]
    dn_ll = len(lows) >= 2 and lows[-1][1] < lows[-2][1]

    direction = "--"
    if up_hh and up_hl:
        direction = "CALL"
    elif dn_lh and dn_ll:
        direction = "PUT"
    else:
        return None

    # Impulse extremes (use last swing L->H for CALL, H->L for PUT).
    low_i = None
    high_i = None
    if direction == "CALL":
        if not lows or not highs:
            return None
        # last low before last high
        hi_idx, hi_price = highs[-1]
        candidates = [(i, p) for i, p in lows if i < hi_idx]
        if not candidates:
            return None
        lo_idx, lo_price = candidates[-1]
        low_i, high_i = lo_idx, hi_idx
        low_imp, high_imp = float(lo_price), float(hi_price)
        impulse_candle = c5[hi_idx]
    else:
        if not lows or not highs:
            return None
        lo_idx, lo_price = lows[-1]
        candidates = [(i, p) for i, p in highs if i < lo_idx]
        if not candidates:
            return None
        hi_idx, hi_price = candidates[-1]
        low_i, high_i = lo_idx, hi_idx
        low_imp, high_imp = float(lo_price), float(hi_price)
        impulse_candle = c5[lo_idx]

    rng = float(high_imp - low_imp)
    if rng <= 0:
        return None
    impulse_strength = rng / float(atr_last)
    impulse_valid = impulse_strength >= 1.5

    # Volume percentile on impulse candle (Binance provides volume; for missing volume use 0).
    vols = [float(c.get("volume", 0.0) or 0.0) for c in c5]
    vol_imp = float(impulse_candle.get("volume", 0.0) or 0.0)
    vol_rank = _percentile_rank(vols[-120:] if len(vols) >= 120 else vols, vol_imp)
    vol_valid = vol_rank >= 0.60

    # Directional close ratio on impulse candle.
    ih = float(impulse_candle.get("high", 0.0))
    il = float(impulse_candle.get("low", 0.0))
    ic = float(impulse_candle.get("close", 0.0))
    denom = max(1e-12, ih - il)
    close_dir_ratio = (ic - il) / denom if direction == "CALL" else (ih - ic) / denom
    close_dir_valid = close_dir_ratio >= 0.70

    # Microstructure proxy for spread/conditions using 1m ranges.
    c1 = candles_1m[-240:] if candles_1m else []
    r1 = [float(c.get("high", 0.0)) - float(c.get("low", 0.0)) for c in c1 if c.get("high") is not None]
    spread_proxy = float(sum(r1[-60:]) / max(1, len(r1[-60:]))) if r1 else 0.0
    if r1:
        mean_r = float(sum(r1[-60:]) / max(1, len(r1[-60:])))
        var_r = float(sum((x - mean_r) ** 2 for x in r1[-60:]) / max(1, len(r1[-60:])))
        sd_r = math.sqrt(var_r)
        spread_ok = (r1[-1] <= mean_r + sd_r) if len(r1) >= 5 else True
    else:
        spread_ok = True

    # Fibonacci levels.
    fibs = {0.618: high_imp - rng * 0.618, 0.705: high_imp - rng * 0.705, 0.786: high_imp - rng * 0.786}
    if direction == "PUT":
        # For down impulse, levels are measured upward from low.
        fibs = {0.618: low_imp + rng * 0.618, 0.705: low_imp + rng * 0.705, 0.786: low_imp + rng * 0.786}

    # Spread-adjusted threshold in price units.
    threshold = max(float(spread_proxy), float(atr_last) * 0.10)
    touched = [(r, lvl) for r, lvl in fibs.items() if abs(current - float(lvl)) <= threshold]
    fib_touched = bool(touched)
    fib_level = min(touched, key=lambda x: abs(current - float(x[1])))[0] if touched else None

    # Corrective wave ratios.
    if direction == "CALL":
        retr = (high_imp - current) / rng
        overlap = current < low_imp
    else:
        retr = (current - low_imp) / rng
        overlap = current > high_imp

    wave2_valid = 0.50 <= retr <= 0.786
    wave4_valid = 0.382 <= retr <= 0.50
    corrective_valid = (wave2_valid or wave4_valid) and retr <= 0.90 and not overlap

    # Harmonic (Gartley) from last 5 pivots.
    harmonic = {"pattern": None, "prz_score": None}
    harmonic_valid = False
    if len(piv) >= 5:
        last5 = piv[-5:]
        # Require alternating types.
        alt = all(last5[i][1] != last5[i - 1][1] for i in range(1, 5))
        if alt:
            _, _, x = last5[0]
            _, _, a = last5[1]
            _, _, b = last5[2]
            _, _, c = last5[3]
            _, _, d = last5[4]
            xa = abs(a - x)
            ab = abs(b - a)
            bc = abs(c - b)
            cd = abs(d - c)
            xd = abs(d - x)
            if xa > 0 and ab > 0 and bc > 0:
                r_ab = ab / xa
                r_bc = bc / ab
                r_cd = cd / bc if bc > 0 else 0.0
                r_xd = xd / xa

                def near(target: float, val: float) -> bool:
                    return abs(val - target) <= (0.03 * target)

                bc_targets = [0.382, 0.886]
                cd_targets = [1.272, 1.618]
                bc_t = min(bc_targets, key=lambda t: abs(r_bc - t))
                cd_t = min(cd_targets, key=lambda t: abs(r_cd - t))

                prz_score = abs(r_ab - 0.618) + abs(r_bc - bc_t) + abs(r_cd - cd_t) + abs(r_xd - 0.786)
                harmonic["pattern"] = "Gartley"
                harmonic["prz_score"] = float(prz_score)
                harmonic_valid = (
                    near(0.618, r_ab)
                    and near(0.786, r_xd)
                    and (abs(r_bc - bc_t) <= 0.03 * bc_t)
                    and (abs(r_cd - cd_t) <= 0.03 * cd_t)
                    and float(prz_score) < 0.05
                )

    # Momentum/volatility/regime.
    rsi14 = _rsi(closes5, 14)
    rsi_last = rsi14[-1] if rsi14 else None
    rsi_slope = None
    if len(rsi14) >= 4 and all(v is not None for v in rsi14[-4:]):
        rsi_slope = float(rsi14[-1] - rsi14[-4]) / 3.0

    ema20 = _ema(closes5, 20)
    ema_slope = None
    if len(ema20) >= 4 and all(v is not None for v in ema20[-4:]):
        ema_slope = float(ema20[-1] - ema20[-4]) / 3.0

    macd_h = _macd_hist(closes5)
    macd_delta = None
    if len(macd_h) >= 3 and macd_h[-1] is not None and macd_h[-2] is not None:
        macd_delta = float(macd_h[-1] - macd_h[-2])

    atr_vals = [a for a in atrs if a is not None]
    atr_pct = _percentile_rank([float(a) for a in atr_vals[-200:]] if atr_vals else [], float(atr_last)) * 100.0

    bb_w = _bollinger_width(closes5, 20, 2.0)
    bb_last = bb_w[-1] if bb_w else None

    adx = _adx(c5, 14)
    hurst = _hurst_approx(closes5, 100)

    regime = "neutral"
    if adx is not None and hurst is not None:
        if atr_pct >= 80 and adx < 15:
            regime = "erratico"
        elif adx >= 20 and hurst >= 0.55:
            regime = "tendencial"
        elif adx < 20 and hurst < 0.50:
            regime = "reversion"

    momentum_ok = True
    if direction == "CALL":
        if rsi_slope is not None and rsi_slope < 0:
            momentum_ok = False
        if ema_slope is not None and ema_slope < 0:
            momentum_ok = False
        if macd_delta is not None and macd_delta < 0:
            momentum_ok = False
    else:
        if rsi_slope is not None and rsi_slope > 0:
            momentum_ok = False
        if ema_slope is not None and ema_slope > 0:
            momentum_ok = False
        if macd_delta is not None and macd_delta > 0:
            momentum_ok = False

    confluence = (
        impulse_valid
        and vol_valid
        and close_dir_valid
        and fib_touched
        and corrective_valid
        and spread_ok
        and regime != "erratico"
        and atr_pct > 40
        and momentum_ok
    )

    status = "no_signal"
    if confluence:
        status = "evaluation"

    # Model outputs are intentionally absent until trained.
    p1 = None
    p2 = None
    p_final = None

    ev = None
    size = None
    if p_final is not None and payout > 0:
        ev = float(p_final * payout - (1.0 - p_final))
        b = float(payout)
        q = 1.0 - float(p_final)
        f = ((b * float(p_final)) - q) / b
        size = max(0.0, 0.25 * f)

    invalidations = []
    if direction == "CALL":
        invalidations.append("rompe low del impulso")
    elif direction == "PUT":
        invalidations.append("rompe high del impulso")
    invalidations.append("retroceso > 0.90")
    invalidations.append("regimen erratico")
    invalidations.append("spread proxy > media+1sigma")

    meta: Dict[str, Any] = {
        "agent": "quantitative_signal_architect_v1",
        "timeframes": {"base": expiry_time, "micro": "1m", "macro": "15m"},
        "candle_time": last_candle_time,
        "horizon": f"1 candle ahead ({expiry_time})",
        "target": "1 if close[t+1] > entry else 0",
        "regime": {"label": regime, "adx14": adx, "atr_percentile": atr_pct, "hurst": hurst},
        "impulse": {
            "direction": direction,
            "low": low_imp,
            "high": high_imp,
            "range": rng,
            "atr14": float(atr_last),
            "impulse_strength": impulse_strength,
            "valid": impulse_valid,
            "volume_percentile": vol_rank * 100.0,
            "volume_valid": vol_valid,
            "close_dir_ratio": close_dir_ratio,
            "close_dir_valid": close_dir_valid,
        },
        "fibonacci": {
            "touched": fib_touched,
            "level": fib_level,
            "threshold": threshold,
            "levels": {str(k): float(v) for k, v in fibs.items()},
        },
        "corrective": {
            "retracement_ratio": retr,
            "wave2_valid": wave2_valid,
            "wave4_valid": wave4_valid,
            "valid": corrective_valid,
        },
        "harmonic": harmonic,
        "features": {
            "rsi14": rsi_last,
            "rsi_slope": rsi_slope,
            "ema20_slope": ema_slope,
            "macd_hist_delta": macd_delta,
            "bollinger_width": bb_last,
            "spread_proxy": spread_proxy,
            "spread_ok": spread_ok,
        },
        "model": {"P1": p1, "P2": p2, "P_final": p_final, "trained": False},
        "execution": {
            "criteria": {"P_final_min": 0.62, "vol_percentile_min": 40, "EV_min": 0.05},
            "EV": ev,
            "position_size": size,
            "allowed": False,
        },
        "risk": {
            "session_dd_max": 5,
            "month_dd_max": 12,
            "pause_after_losses": 3,
        },
        "invalidation": invalidations,
        "notes": {
            "probabilities": "P1/P2/P_final are null until a trained supervised model is integrated.",
            "data_needed": "Collect 5m+1m+15m candles with volume; label using close[t+1] > entry; then train (walk-forward) and validate OOS.",
        },
    }

    report = "\n".join(
        [
            f"1️⃣ Regimen detectado: {regime} (ADX14={_fmt(adx,2)}, ATR%={_fmt(atr_pct,1)}, H={_fmt(hurst,2)})",
            f"2️⃣ Impulso validado: {'si' if impulse_valid else 'no'} (strength={_fmt(impulse_strength,2)}xATR, vol%={_fmt(vol_rank*100,1)}, close_dir={_fmt(close_dir_ratio,2)})",
            f"3️⃣ Nivel Fibonacci tocado: {str(fib_level) if fib_level is not None else 'no'} (thr={_fmt(threshold,6)})",
            f"4️⃣ Patron armonico: {harmonic.get('pattern') or 'no'} (score={_fmt(harmonic.get('prz_score'),4)})",
            f"5️⃣ Features clave: RSI14={_fmt(rsi_last,2)} rsi_slope={_fmt(rsi_slope,3)} ema20_slope={_fmt(ema_slope,6)} macd_d={_fmt(macd_delta,6)} bb_w={_fmt(bb_last,4)}",
            "6️⃣ P1, P2, P_final: -- (modelo no entrenado / falta pipeline)",
            "7️⃣ Expectativa matematica: -- (requiere P_final)",
            "8️⃣ Tamano sugerido: -- (requiere P_final y Kelly)",
            "9️⃣ Condiciones de invalidez: " + ", ".join(invalidations),
        ]
    )

    meta["report_text"] = report

    return QuantScanResult(
        instrument=instrument,
        direction=direction,
        expiry_time=expiry_time,
        entry=float(current),
        status=status,
        report_text=report,
        meta=meta,
    )


_NO_SIGNAL_TEXT = "NO HAY CONDICIONES ÓPTIMAS EN M5 PARA EXPIRACIÓN DE 5 MINUTOS"


def _atr_last(candles: List[Dict[str, Any]], period: int = 14) -> Optional[float]:
    a = _atr(candles, period)
    if not a:
        return None
    v = a[-1]
    if v is None:
        return None
    try:
        x = float(v)
    except Exception:
        return None
    return x if math.isfinite(x) and x > 0 else None


def _body_to_range(c: Dict[str, Any]) -> float:
    o = float(c.get("open", 0.0))
    h = float(c.get("high", 0.0))
    l = float(c.get("low", 0.0))
    cl = float(c.get("close", 0.0))
    rng = max(1e-12, h - l)
    return abs(cl - o) / rng


def _wick_ratios(c: Dict[str, Any]) -> Tuple[float, float]:
    o = float(c.get("open", 0.0))
    h = float(c.get("high", 0.0))
    l = float(c.get("low", 0.0))
    cl = float(c.get("close", 0.0))
    rng = max(1e-12, h - l)
    upper = (h - max(o, cl)) / rng
    lower = (min(o, cl) - l) / rng
    return upper, lower


def _is_bull(c: Dict[str, Any]) -> bool:
    return float(c.get("close", 0.0)) > float(c.get("open", 0.0))


def _is_bear(c: Dict[str, Any]) -> bool:
    return float(c.get("close", 0.0)) < float(c.get("open", 0.0))


def _engulfing(curr: Dict[str, Any], prev: Dict[str, Any], direction: str) -> bool:
    co = float(curr.get("open", 0.0))
    cc = float(curr.get("close", 0.0))
    po = float(prev.get("open", 0.0))
    pc = float(prev.get("close", 0.0))

    c_lo = min(co, cc)
    c_hi = max(co, cc)
    p_lo = min(po, pc)
    p_hi = max(po, pc)
    if direction == "CALL":
        return _is_bull(curr) and (c_lo <= p_lo) and (c_hi >= p_hi)
    return _is_bear(curr) and (c_lo <= p_lo) and (c_hi >= p_hi)


def _vol_rel(candles: List[Dict[str, Any]], lookback: int = 20) -> Optional[float]:
    vols = [float(c.get("volume", 0.0) or 0.0) for c in candles[-lookback:]]
    if len(vols) < 5:
        return None
    avg = sum(vols[:-1]) / max(1, len(vols[:-1]))
    if avg <= 0:
        return None
    return float(vols[-1] / avg)


def _recent_consolidation(candles: List[Dict[str, Any]], atr: float, n: int = 18) -> bool:
    # Lateral estrecho if last N range is small relative to ATR.
    w = candles[-n:]
    if len(w) < n:
        return True
    hi = max(float(c.get("high", 0.0)) for c in w)
    lo = min(float(c.get("low", 0.0)) for c in w)
    rng = hi - lo
    return rng <= (1.2 * atr)


def _find_impulse(candles: List[Dict[str, Any]], atr: float, direction: str) -> Optional[Tuple[int, int, float, float]]:
    # Finds the most recent 3-candle impulse (consecutive strong candles).
    if len(candles) < 10:
        return None
    for end in range(len(candles) - 1, 5, -1):
        seq = candles[end - 2 : end + 1]
        if len(seq) != 3:
            continue
        if direction == "CALL" and not all(_is_bull(x) for x in seq):
            continue
        if direction == "PUT" and not all(_is_bear(x) for x in seq):
            continue
        # Each candle must have body dominance and enough range.
        ok = True
        for x in seq:
            h = float(x.get("high", 0.0))
            l = float(x.get("low", 0.0))
            if (h - l) < 0.9 * atr:
                ok = False
                break
            if _body_to_range(x) < 0.55:
                ok = False
                break
        if not ok:
            continue
        start = end - 2
        # Use swing extremes over impulse window.
        high_imp = max(float(c.get("high", 0.0)) for c in candles[start : end + 1])
        low_imp = min(float(c.get("low", 0.0)) for c in candles[start : end + 1])
        return start, end, low_imp, high_imp
    return None


def _fib_levels(low_imp: float, high_imp: float, direction: str) -> Dict[str, float]:
    rng = float(high_imp - low_imp)
    if rng <= 0:
        return {}
    if direction == "CALL":
        return {
            "0.5": high_imp - rng * 0.5,
            "0.618": high_imp - rng * 0.618,
            "0.705": high_imp - rng * 0.705,
        }
    # PUT impulse is down: fib measured upward from low.
    return {
        "0.5": low_imp + rng * 0.5,
        "0.618": low_imp + rng * 0.618,
        "0.705": low_imp + rng * 0.705,
    }


def _touched_zone(c: Dict[str, Any], level: float, tol: float) -> bool:
    h = float(c.get("high", 0.0))
    l = float(c.get("low", 0.0))
    cl = float(c.get("close", 0.0))
    if l <= level <= h:
        return True
    return abs(cl - level) <= tol


def _liquidity_sweep(candles: List[Dict[str, Any]], atr: float, direction: str) -> bool:
    # Detect sweep of equal highs/lows in the last ~30 bars.
    piv = _pivots(candles, 2)
    if len(piv) < 6:
        return False
    tol = 0.10 * atr
    cur = candles[-1]
    ch = float(cur.get("high", 0.0))
    cl = float(cur.get("low", 0.0))
    cc = float(cur.get("close", 0.0))

    highs = [p for p in piv if p[1] == "H"]
    lows = [p for p in piv if p[1] == "L"]
    if direction == "CALL":
        # Sweep lows: two recent lows equal, current wick below, closes back above.
        if len(lows) < 2:
            return False
        l1 = float(lows[-1][2])
        l2 = float(lows[-2][2])
        if abs(l1 - l2) > tol:
            return False
        return (cl < min(l1, l2) - 0.01 * atr) and (cc > max(l1, l2))
    # PUT: sweep highs
    if len(highs) < 2:
        return False
    h1 = float(highs[-1][2])
    h2 = float(highs[-2][2])
    if abs(h1 - h2) > tol:
        return False
    return (ch > max(h1, h2) + 0.01 * atr) and (cc < min(h1, h2))


def _fvg_near(candles: List[Dict[str, Any]], atr: float, direction: str) -> bool:
    # Fair value gap from 3-candle pattern.
    if len(candles) < 4:
        return False
    tol = 0.15 * atr
    c0 = candles[-1]
    px = float(c0.get("close", 0.0))
    for i in range(len(candles) - 1, 1, -1):
        a = candles[i - 2]
        b = candles[i - 1]
        c = candles[i]
        ah = float(a.get("high", 0.0))
        al = float(a.get("low", 0.0))
        ch = float(c.get("high", 0.0))
        cl = float(c.get("low", 0.0))
        # bullish gap
        if ah < cl:
            gap_mid = (ah + cl) / 2
            if abs(px - gap_mid) <= tol:
                return True
        # bearish gap
        if al > ch:
            gap_mid = (al + ch) / 2
            if abs(px - gap_mid) <= tol:
                return True
        if (len(candles) - 1) - i > 25:
            break
    return False


def _order_block_near(candles: List[Dict[str, Any]], impulse_start: int, atr: float, direction: str) -> bool:
    # Order block: last opposite candle before impulse.
    tol = 0.20 * atr
    px = float(candles[-1].get("close", 0.0))
    idx = None
    for i in range(impulse_start - 1, max(-1, impulse_start - 8), -1):
        if i < 0:
            break
        c = candles[i]
        if direction == "CALL" and _is_bear(c):
            idx = i
            break
        if direction == "PUT" and _is_bull(c):
            idx = i
            break
    if idx is None:
        return False
    ob = candles[idx]
    zone_mid = (float(ob.get("open", 0.0)) + float(ob.get("close", 0.0))) / 2
    return abs(px - zone_mid) <= tol


def _reaction_confirm(curr: Dict[str, Any], prev: Dict[str, Any], direction: str, atr: float) -> Tuple[bool, bool, bool]:
    # (rejection, engulfing, strong_candle)
    upper, lower = _wick_ratios(curr)
    rng = float(curr.get("high", 0.0)) - float(curr.get("low", 0.0))
    strong = (rng >= 1.1 * atr) and (_body_to_range(curr) >= 0.60)
    eng = _engulfing(curr, prev, direction)
    if direction == "CALL":
        rej = (lower >= 0.45) and _is_bull(curr)
    else:
        rej = (upper >= 0.45) and _is_bear(curr)
    return rej, eng, strong


def scan_binary_oanda_m5_strategy(
    instrument: str,
    candles_m5: List[Dict[str, Any]],
) -> Optional[QuantScanResult]:
    # Fixed system: M5 only, expiry 5 minutes.
    if len(candles_m5) < 120:
        return None
    c = candles_m5[-260:]
    atr = _atr_last(c, 14)
    if atr is None:
        return None

    piv = _pivots(c, 2)
    highs = [(i, p) for i, k, p in piv if k == "H"]
    lows = [(i, p) for i, k, p in piv if k == "L"]
    if len(highs) < 2 or len(lows) < 2:
        return None

    up = highs[-1][1] > highs[-2][1] and lows[-1][1] > lows[-2][1]
    dn = highs[-1][1] < highs[-2][1] and lows[-1][1] < lows[-2][1]

    if not up and not dn:
        return None

    # Prohibited: tight sideways.
    if _recent_consolidation(c, atr, 18):
        return None

    direction = "CALL" if up else "PUT"
    impulse = _find_impulse(c, atr, direction)
    if not impulse:
        return None
    impulse_start, impulse_end, low_imp, high_imp = impulse
    fibs = _fib_levels(low_imp, high_imp, direction)
    if not fibs:
        return None

    curr = c[-1]
    prev = c[-2]
    px = float(curr.get("close", 0.0))
    tol = max(0.10 * atr, 1e-12)

    fib_hit = any(_touched_zone(curr, lvl, tol) for lvl in fibs.values())
    fib_mid = fibs.get("0.618") if "0.618" in fibs else None
    in_05_0618 = False
    if fib_mid is not None:
        lo = min(float(fibs.get("0.5", fib_mid)), float(fib_mid))
        hi = max(float(fibs.get("0.5", fib_mid)), float(fib_mid))
        in_05_0618 = (float(curr.get("low", px)) <= hi + tol) and (float(curr.get("high", px)) >= lo - tol)

    ob = _order_block_near(c, impulse_start, atr, direction)
    sweep = _liquidity_sweep(c, atr, direction)
    fvg = _fvg_near(c, atr, direction)
    rej, eng, strong = _reaction_confirm(curr, prev, direction, atr)
    volr = _vol_rel(c, 20)
    vol_ok = (volr is not None) and (volr >= 1.15)
    rng_ok = (float(curr.get("high", 0.0)) - float(curr.get("low", 0.0))) >= (1.05 * atr)

    # Confluence count (must be >=3)
    confluences: List[str] = []
    if fib_hit and in_05_0618:
        confluences.append("Retroceso 0.5-0.618 Fibonacci")
    if sweep:
        confluences.append("Barrido de liquidez (equal highs/lows)")
    if ob:
        confluences.append("Order Block reciente")
    if fvg:
        confluences.append("FVG cercano")
    if rej:
        confluences.append("Vela de rechazo")
    if eng:
        confluences.append("Engulfing valido")
    if vol_ok:
        confluences.append("Volumen relativo alto")
    if rng_ok:
        confluences.append("Expansion de rango")

    if len(confluences) < 3:
        return None

    # Mandatory reaction confirmation.
    if not (rej or eng or strong):
        return None

    # Avoid entries in the middle of range: require near fib zone.
    if not in_05_0618:
        return None

    # Probabilistic scoring.
    prob = 60
    if fib_hit:
        prob += 10
    # Breakout prior (simple): last pivot high/low was broken within last 10 bars.
    breakout = False
    if direction == "CALL":
        prev_high = float(highs[-2][1])
        breakout = any(float(x.get("high", 0.0)) > prev_high for x in c[-12:-1])
    else:
        prev_low = float(lows[-2][1])
        breakout = any(float(x.get("low", 0.0)) < prev_low for x in c[-12:-1])
    if breakout:
        prob += 10
        confluences.append("Ruptura previa")
    if sweep:
        prob += 10
    if (eng or strong):
        prob += 5
    if rng_ok:
        prob += 5
    prob = min(90, prob)

    confidence = "Media"
    if prob >= 80 and len(confluences) >= 4:
        confidence = "Alta"
    elif prob < 70:
        confidence = "Baja"

    # Invalidation level.
    buffer = 0.10 * atr
    if direction == "CALL":
        invalid = float(low_imp) - buffer
    else:
        invalid = float(high_imp) + buffer

    last_candle_time = int(curr.get("time", 0) or 0)
    meta = {
        "agent": "tv_oanda_m5_reaction_v1",
        "expiry": "5m",
        "timeframes": {"base": "5m"},
        "candle_time": last_candle_time,
        "signal": {
            "instrument": instrument,
            "direction": direction,
            "entry": px,
            "expiry": "5m",
            "probability": prob,
            "confidence": confidence,
            "invalidation": invalid,
            "confluences": confluences,
        },
    }

    report = "\n".join(
        [
            "🚨 ALERTA BINARIA M5",
            "",
            f"Activo: {instrument} (OANDA)",
            f"Dirección: {direction}",
            f"Entrada: {px:.5f}",
            "Expiración: 5 minutos",
            f"Probabilidad estimada: {prob}%",
            "",
            "Confluencias:",
            *[f"- {x}" for x in confluences],
            "",
            "Invalidación:",
            f"- Cierre {'por debajo' if direction=='CALL' else 'por encima'} de {invalid:.5f}",
            "",
            f"Confianza estructural: {confidence}",
        ]
    )
    meta["report_text"] = report

    return QuantScanResult(
        instrument=instrument,
        direction=direction,
        expiry_time="5m",
        entry=px,
        status="confirmed",
        report_text=report,
        meta=meta,
    )


def scan_jade_binary_m5_pulse_strategy(
    instrument: str,
    candles_m5: List[Dict[str, Any]],
) -> Optional[QuantScanResult]:
    """Jade-designed binary strategy (M5 only, expiry 5m).

    Intent: trend continuation via controlled pullback + oscillator snap.
    Deterministic scoring capped at 90%.
    """

    if len(candles_m5) < 240:
        return None
    c = candles_m5[-320:]
    atr = _atr_last(c, 14)
    if atr is None:
        return None

    closes = [float(x.get("close", 0.0)) for x in c]
    ema50 = _ema(closes, 50)
    ema200 = _ema(closes, 200)
    if ema50[-1] is None or ema200[-1] is None:
        return None

    px = float(closes[-1])
    e50 = float(ema50[-1])
    e200 = float(ema200[-1])

    # Trend regime.
    e50_slope = None
    if len(ema50) >= 10 and ema50[-10] is not None:
        e50_slope = float(ema50[-1]) - float(ema50[-10])

    bull = (px > e200) and (e50 > e200) and (e50_slope is None or e50_slope > 0)
    bear = (px < e200) and (e50 < e200) and (e50_slope is None or e50_slope < 0)
    if not bull and not bear:
        return None

    direction = "CALL" if bull else "PUT"

    # Avoid tight sideways.
    if _recent_consolidation(c, atr, 20):
        return None

    curr = c[-1]
    prev = c[-2]

    # Pullback to EMA50.
    tol = 0.25 * atr
    low = float(curr.get("low", px))
    high = float(curr.get("high", px))
    pullback = (low <= e50 + tol) and (high >= e50 - tol)

    # Stochastic 5,3,3 last and previous.
    # Compute last2 by evaluating full series once on the window.
    k_period, k_smooth, d_period = 5, 3, 3
    highs = [float(x.get("high", 0.0)) for x in c]
    lows = [float(x.get("low", 0.0)) for x in c]
    raw_k: List[Optional[float]] = [None] * len(c)
    for i in range(len(c)):
        if i < k_period - 1:
            continue
        hh = max(highs[i - k_period + 1 : i + 1])
        ll = min(lows[i - k_period + 1 : i + 1])
        raw_k[i] = 50.0 if hh == ll else (closes[i] - ll) / (hh - ll) * 100.0

    k_s: List[Optional[float]] = [None] * len(c)
    for i in range(len(c)):
        if raw_k[i] is None:
            continue
        w = [raw_k[i - j] for j in range(k_smooth) if i - j >= 0]
        w2 = [v for v in w if v is not None]
        if len(w2) < k_smooth:
            continue
        k_s[i] = float(sum(w2[:k_smooth]) / k_smooth)

    d_s: List[Optional[float]] = [None] * len(c)
    for i in range(len(c)):
        if k_s[i] is None:
            continue
        w = [k_s[i - j] for j in range(d_period) if i - j >= 0]
        w2 = [v for v in w if v is not None]
        if len(w2) < d_period:
            continue
        d_s[i] = float(sum(w2[:d_period]) / d_period)

    k_now = k_s[-1]
    d_now = d_s[-1]
    k_prev = k_s[-2] if len(k_s) >= 2 else None
    d_prev = d_s[-2] if len(d_s) >= 2 else None
    if k_now is None or d_now is None or k_prev is None or d_prev is None:
        return None

    stoch_extreme = (k_now <= 20.0) if direction == "CALL" else (k_now >= 80.0)
    stoch_cross = (k_prev <= d_prev and k_now > d_now) if direction == "CALL" else (k_prev >= d_prev and k_now < d_now)

    # Candle confirmation.
    rej, eng, strong = _reaction_confirm(curr, prev, direction, atr)
    confirm = rej or eng or strong

    # Volume and range expansion.
    volr = _vol_rel(c, 20)
    vol_ok = (volr is not None) and (volr >= 1.10)
    rng = float(curr.get("high", 0.0)) - float(curr.get("low", 0.0))
    rng_ok = rng >= 0.90 * atr

    confluences: List[str] = []
    confluences.append("Tendencia por EMA200 + EMA50")
    if pullback:
        confluences.append("Pullback a EMA50")
    if stoch_extreme:
        confluences.append("Stoch(5,3,3) en zona extrema")
    if stoch_cross:
        confluences.append("Stoch confirmacion (cruce)")
    if rej:
        confluences.append("Rechazo (mecha)")
    if eng:
        confluences.append("Engulfing")
    if strong:
        confluences.append("Vela fuerte")
    if vol_ok:
        confluences.append("Volumen relativo alto")
    if rng_ok:
        confluences.append("Rango suficiente")

    # Must have controlled pullback + oscillator + confirmation.
    if not pullback:
        return None
    if not (stoch_extreme and stoch_cross):
        return None
    if not confirm:
        return None
    if not rng_ok:
        return None

    # Confluence minimum.
    if len(confluences) < 4:
        return None

    # Probability scoring (cap 90).
    prob = 60
    sep = abs(e50 - e200)
    if sep >= 0.15 * atr:
        prob += 10
    if pullback:
        prob += 10
    if stoch_extreme:
        prob += 5
    if stoch_cross:
        prob += 5
    if (eng or rej):
        prob += 5
    if vol_ok:
        prob += 5
    if strong:
        prob += 5
    prob = min(90, prob)

    confidence = "Media"
    if prob >= 82:
        confidence = "Alta"
    elif prob <= 70:
        confidence = "Baja"

    buffer = 0.12 * atr
    invalid = (low - buffer) if direction == "CALL" else (high + buffer)

    last_candle_time = int(curr.get("time", 0) or 0)
    meta = {
        "agent": "jade_m5_pulse_v1",
        "expiry": "5m",
        "timeframes": {"base": "5m"},
        "candle_time": last_candle_time,
        "strategy": {
            "name": "Jade M5 Pulse",
            "thesis": "continuacion en tendencia con pullback controlado + snap de oscilador",
        },
        "signal": {
            "instrument": instrument,
            "direction": direction,
            "entry": px,
            "expiry": "5m",
            "probability": prob,
            "confidence": confidence,
            "invalidation": float(invalid),
            "confluences": confluences,
        },
        "indicators": {
            "ema50": e50,
            "ema200": e200,
            "stoch_k": float(k_now),
            "stoch_d": float(d_now),
            "atr14": float(atr),
            "vol_rel": float(volr) if volr is not None else None,
        },
    }

    report = "\n".join(
        [
            "🚨 ALERTA BINARIA M5",
            "",
            f"Activo: {instrument}",
            f"Dirección: {direction}",
            f"Entrada: {px:.5f}",
            "Expiración: 5 minutos",
            f"Probabilidad estimada: {prob}%",
            "",
            "Confluencias:",
            *[f"- {x}" for x in confluences],
            "",
            "Invalidación:",
            f"- Cierre {'por debajo' if direction=='CALL' else 'por encima'} de {float(invalid):.5f}",
            "",
            f"Confianza estructural: {confidence}",
        ]
    )
    meta["report_text"] = report

    return QuantScanResult(
        instrument=instrument,
        direction=direction,
        expiry_time="5m",
        entry=px,
        status="confirmed",
        report_text=report,
        meta=meta,
    )


def _bos_choch(candles: List[Dict[str, Any]]) -> Dict[str, Any]:
    # Very lightweight BOS/CHoCH proxy using pivots and last close.
    out: Dict[str, Any] = {"bos": None, "choch": None}
    if len(candles) < 40:
        return out
    piv = _pivots(candles, 2)
    highs = [p for p in piv if p[1] == "H"]
    lows = [p for p in piv if p[1] == "L"]
    if len(highs) < 2 or len(lows) < 2:
        return out
    last_close = float(candles[-1].get("close", 0.0))
    prev_high = float(highs[-1][2])
    prev_low = float(lows[-1][2])

    bos_up = last_close > prev_high
    bos_dn = last_close < prev_low
    out["bos"] = "up" if bos_up else "down" if bos_dn else None

    # CHoCH: break opposite direction after prior trend (approx).
    # Determine prior trend by last two pivots.
    up = float(highs[-1][2]) > float(highs[-2][2]) and float(lows[-1][2]) > float(lows[-2][2])
    dn = float(highs[-1][2]) < float(highs[-2][2]) and float(lows[-1][2]) < float(lows[-2][2])
    if up and bos_dn:
        out["choch"] = "down"
    elif dn and bos_up:
        out["choch"] = "up"
    else:
        out["choch"] = None
    return out


def _rsi_divergence(candles: List[Dict[str, Any]], direction: str, period: int = 14) -> Optional[str]:
    closes = [float(c.get("close", 0.0)) for c in candles]
    rsi = _rsi(closes, period)
    piv = _pivots(candles, 2)
    # Use last two price pivots and compare RSI at those indices.
    if direction == "CALL":
        lows = [(i, p) for i, k, p in piv if k == "L" and i < len(rsi) and rsi[i] is not None]
        if len(lows) < 2:
            return None
        (i1, p1), (i2, p2) = lows[-2], lows[-1]
        r1 = float(rsi[i1] or 0)
        r2 = float(rsi[i2] or 0)
        if p2 < p1 and r2 > r1:
            return "regular"
        if p2 > p1 and r2 < r1:
            return "hidden"
        return None
    highs = [(i, p) for i, k, p in piv if k == "H" and i < len(rsi) and rsi[i] is not None]
    if len(highs) < 2:
        return None
    (i1, p1), (i2, p2) = highs[-2], highs[-1]
    r1 = float(rsi[i1] or 0)
    r2 = float(rsi[i2] or 0)
    if p2 > p1 and r2 < r1:
        return "regular"
    if p2 < p1 and r2 > r1:
        return "hidden"
    return None


def scan_jade_binary_m5_structural_scalp_strategy(
    instrument: str,
    candles_m5: List[Dict[str, Any]],
    candles_15m: List[Dict[str, Any]],
    candles_1h: List[Dict[str, Any]],
    price_now: Optional[float] = None,
    # Configurable Parameters
    swing_depth: int = 4,
    min_impulse_candles: int = 5,
    elliott_w3_ext: float = 1.618,
    elliott_w4_limit: float = 0.382,
    fib_margin: float = 0.05,
    prealert_max_time: int = 12,
    volatility_min: float = 0.0002,
    ema_min_slope: float = 0.00005,
    sideways_filter: bool = True,
    stoch_k: int = 5,
    stoch_d: int = 3,
    stoch_slowing: int = 3,
    rsi_period: int = 14,
    ema_fast_p: int = 50,
    ema_slow_p: int = 100,
    ema_filter_p: int = 200,
) -> List[QuantScanResult]:
    """
    Advanced strategy based on Market Structure, Elliott Waves, and multi-indicator confirmation.
    Includes PRE-ALERTA (Prepare) and FINAL ALERT (Entry) stages.
    """
    if len(candles_m5) < max(200, ema_filter_p + 10):
        return []

    # 1. Indicators Calculation
    closes = [float(c.get("close", 0.0)) for c in candles_m5]
    px = price_now if price_now is not None else closes[-1]
    
    ema_50 = _ema(closes, ema_fast_p)[-1]
    ema_100 = _ema(closes, ema_slow_p)[-1]
    ema_200 = _ema(closes, ema_filter_p)[-1]
    
    if None in [ema_50, ema_100, ema_200]:
        return []
    
    # EMA Alignment
    uptrend = px > ema_50 > ema_100 > ema_200
    downtrend = px < ema_50 < ema_100 < ema_200
    
    if sideways_filter:
        # Check slope or interleaving
        ema_50_prev = _ema(closes[:-1], ema_fast_p)[-1]
        if ema_50_prev:
            slope = abs(ema_50 - ema_50_prev)
            if slope < ema_min_slope:
                return []
        # Exclude if not clearly aligned
        if not uptrend and not downtrend:
            return []

    # 2. Market Structure & Elliott Waves
    pivots = _pivots(candles_m5, swing_depth)
    if len(pivots) < 5:
        return []
    
    # Try to identify an Elliott 5-wave sequence or a valid operational impulse
    # For now, we look at the last major leg as the impulse
    last_p = pivots[-1]
    prev_p = pivots[-2]
    
    direction = "CALL" if last_p[1] == "H" and prev_p[1] == "L" else "PUT" if last_p[1] == "L" and prev_p[1] == "H" else None
    if not direction:
        return []
    
    # Elliott Rules Validation (Simplified proxy for real-time)
    # We check if the sequence of recent pivots resembles a 1-2-3 or 1-2-3-4-5
    ell_valid = False
    retrace_ratio = 1.0
    if direction == "CALL":
        # Check HH/HL
        highs = [p for p in pivots if p[1] == "H"]
        lows = [p for p in pivots if p[1] == "L"]
        if len(highs) >= 2 and len(lows) >= 2:
            if highs[-1][2] > highs[-2][2] and lows[-1][2] > lows[-2][2]:
                ell_valid = True
        impulse_low = prev_p[2]
        impulse_high = last_p[2]
        rng = impulse_high - impulse_low
        retrace_ratio = (impulse_high - px) / rng if rng > 0 else 1.0
    else:
        highs = [p for p in pivots if p[1] == "H"]
        lows = [p for p in pivots if p[1] == "L"]
        if len(highs) >= 2 and len(lows) >= 2:
            if highs[-1][2] < highs[-2][2] and lows[-1][2] < lows[-2][2]:
                ell_valid = True
        impulse_high = prev_p[2]
        impulse_low = last_p[2]
        rng = impulse_high - impulse_low
        retrace_ratio = (px - impulse_low) / rng if rng > 0 else 1.0

    if not ell_valid:
        return []

    # 3. Momentum Confirmations
    rsi = _rsi(closes, rsi_period)[-1]
    k, d = _stochastic_kd(candles_m5, stoch_k, stoch_slowing, stoch_d)
    
    if rsi is None or k is None:
        return []

    results = []
    
    # PRE-ALERTA (near)
    # CALL: Stoch cross 80 UP, RSI cross 80 UP, impulse confirmed
    pre_call = direction == "CALL" and uptrend and k > 80 and rsi > 70 # RSI 70-80 is high
    pre_put = direction == "PUT" and downtrend and k < 20 and rsi < 30
    
    # ENTRY (entry)
    # Reaction in Fib 0.5 - 0.618
    in_fib_zone = (0.45 <= retrace_ratio <= 0.65) # Including margin
    
    entry_call = direction == "CALL" and uptrend and in_fib_zone and k > 50 and rsi > 50
    entry_put = direction == "PUT" and downtrend and in_fib_zone and k < 50 and rsi < 50

    meta_common = {
        "agent": "jade_advanced_elliott_v1",
        "instrument": instrument,
        "direction": direction,
        "candle_time": int(candles_m5[-1].get("time", 0)),
        "indicators": {
            "rsi": rsi,
            "stoch_k": k,
            "ema_50": ema_50,
            "ema_100": ema_100,
            "ema_200": ema_200
        },
        "structure": {
            "retrace": retrace_ratio,
            "in_fib": in_fib_zone,
            "bias": "uptrend" if uptrend else "downtrend" if downtrend else "sideways"
        }
    }

    if entry_call or entry_put:
        r = QuantScanResult(
            instrument=instrument,
            direction=direction,
            expiry_time="5m",
            entry=float(px),
            status="entry",
            report_text=f"🚨 ENTRAR YA {direction} - Reacción en zona Fibonacci 0.5-0.618 con estructura Elliott confirmada.",
            meta={**meta_common, "alert_type": "entry"}
        )
        results.append(r)
    elif pre_call or pre_put:
        r = QuantScanResult(
            instrument=instrument,
            direction=direction,
            expiry_time="5m",
            entry=float(px),
            status="near",
            report_text=f"⚠️ PREPARA {direction} - Impulso Elliott detectado, esperando retroceso a zona 0.5-0.618.",
            meta={**meta_common, "alert_type": "near"}
        )
        results.append(r)

    return results
