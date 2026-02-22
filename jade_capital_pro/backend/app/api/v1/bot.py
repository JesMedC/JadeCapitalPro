from fastapi import APIRouter, Body, Depends, HTTPException
from sqlmodel import Session, select
from sqlalchemy import desc
from sqlalchemy import text
from typing import List, Dict, Optional
from datetime import datetime
import json
import requests
import threading
import time

from ...db.db import get_session, engine
from ...models.trading import TradeBinary, TradeForex, AppConfig, BotAlert
from ...ai.bot_engine import JadeBotEngine
from ...ai.learning_module import JadeLearningModule
from ...ai.quant_scanner import (
    scan_quant_binary_setup,
    scan_test_strategy_ema200_stoch,
    scan_binary_oanda_m5_strategy,
    scan_jade_binary_m5_pulse_strategy,
    scan_jade_binary_m5_structural_scalp_strategy,
)
from ...market.market_data import fetch_candles as fetch_any_candles, fetch_price as fetch_any_price
from ...api.deps import get_current_user
from ...models.trading import User

router = APIRouter(prefix="/bot", tags=["Jade Bot & IA"])
bot = JadeBotEngine()
ai_module = JadeLearningModule()


_scanner_lock = threading.Lock()
_scanner_thread: threading.Thread | None = None
_scanner_stop: threading.Event | None = None
_scanner_state = {"running": False, "interval_sec": 300, "expiry_time": "5m"}
_scanner_last_msg: dict[str, str] = {}

_ctx_cache: dict[str, dict[str, object]] = {}


def _ensure_scanner_running(default_interval_sec: int = 60) -> None:
    global _scanner_thread, _scanner_stop
    with _scanner_lock:
        if _scanner_state.get("running") and _scanner_thread and _scanner_thread.is_alive():
            return
        _scanner_state["interval_sec"] = int(default_interval_sec)
        _scanner_state["expiry_time"] = "5m"
        _scanner_state["running"] = True
        _scanner_stop = threading.Event()
        _scanner_thread = threading.Thread(target=_scanner_loop, daemon=True)
        _scanner_thread.start()


def _get_or_create_config(db: Session) -> AppConfig:
    cfg = db.get(AppConfig, 1)
    if cfg:
        return cfg
    cfg = AppConfig(id=1)
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return cfg


def _should_notify(channels_json: str, channel: str) -> bool:
    try:
        channels = json.loads(channels_json or '[]')
        return channel in channels
    except Exception:
        return False


def _send_telegram(token: str, chat_id: str, text: str) -> None:
    if not token or not chat_id:
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    requests.post(url, json={"chat_id": chat_id, "text": text})


def _persist_alert(
    db: Session,
    instrument: str,
    direction: str,
    expiry_time: str,
    price: float,
    status: str,
    msg: str,
    alert_type: str = "entry",
    meta_json: str = "{}",
) -> BotAlert:
    alert = BotAlert(
        instrument=instrument,
        direction=direction,
        expiry_time=expiry_time,
        price=float(price),
        status=status,
        message=msg,
        alert_type=alert_type,
        meta_json=meta_json,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


def _is_on_cooldown(db: Session, instrument: str, cooldown_mins: int) -> bool:
    if cooldown_mins <= 0:
        return False
    from datetime import timedelta
    cutoff = datetime.now() - timedelta(minutes=cooldown_mins)
    # Check for recent entry alerts only (to allow PREPARA -> ENTRY transition)
    statement = select(BotAlert).where(
        BotAlert.instrument == instrument,
        BotAlert.alert_type == "entry",
        BotAlert.created_at >= cutoff
    )
    result = db.exec(statement).first()
    return result is not None


def _scanner_loop() -> None:
    while True:
        with _scanner_lock:
            if not _scanner_stop or _scanner_stop.is_set():
                _scanner_state["running"] = False
                return

            interval_sec = int(_scanner_state.get("interval_sec", 30))
            expiry_time = "5m"

        try:
            # Use fresh DB session
            with Session(engine) as db:
                cfg = _get_or_create_config(db)
                try:
                    instruments = json.loads(cfg.instruments_json or "[]")
                except Exception:
                    instruments = []

                for instrument in instruments:
                    if _is_on_cooldown(db, instrument, cfg.bot_cooldown_mins):
                        continue

                    candles5, _p5 = fetch_any_candles(instrument=instrument, timeframe="5m", limit=320)
                    if not candles5:
                        continue

                    # Context candles (cached)
                    now = time.time()
                    cache = _ctx_cache.get(instrument) or {}
                    c15 = cache.get("15m")
                    c1h = cache.get("1h")
                    t15 = float(cache.get("t15", 0.0) or 0.0)
                    t1h = float(cache.get("t1h", 0.0) or 0.0)
                    if (not isinstance(c15, list)) or (now - t15 > 60):
                        c15, _p15 = fetch_any_candles(instrument=instrument, timeframe="15m", limit=240)
                        cache["15m"] = c15
                        cache["t15"] = now
                    if (not isinstance(c1h, list)) or (now - t1h > 300):
                        c1h, _p1h = fetch_any_candles(instrument=instrument, timeframe="1h", limit=240)
                        cache["1h"] = c1h
                        cache["t1h"] = now
                    _ctx_cache[instrument] = cache

                    # Avoid extra provider calls in the background loop.
                    # Strategy can use M5 close as the reference price.
                    price_now = None

                    # New 2-stage structural strategy (near/entry)
                    try:
                        strat_signals = scan_jade_binary_m5_structural_scalp_strategy(
                            instrument=instrument,
                            candles_m5=candles5,
                            candles_15m=c15 if isinstance(c15, list) else [],
                            candles_1h=c1h if isinstance(c1h, list) else [],
                            price_now=price_now,
                            # Advanced Parameters from DB
                            swing_depth=cfg.bot_swing_depth,
                            min_impulse_candles=cfg.bot_min_impulse_candles,
                            elliott_w3_ext=cfg.bot_elliott_w3_ext,
                            elliott_w4_limit=cfg.bot_elliott_w4_limit,
                            fib_margin=cfg.bot_fib_margin,
                            prealert_max_time=cfg.bot_prealert_max_time,
                            volatility_min=cfg.bot_volatility_min,
                            ema_min_slope=cfg.bot_ema_min_slope,
                            sideways_filter=cfg.bot_sideways_filter,
                            stoch_k=cfg.bot_stoch_k,
                            stoch_d=cfg.bot_stoch_d,
                            stoch_slowing=cfg.bot_stoch_slowing,
                            rsi_period=cfg.bot_rsi_period,
                            ema_fast_p=cfg.bot_ema_fast,
                            ema_slow_p=cfg.bot_ema_slow,
                            ema_filter_p=cfg.bot_ema_filter,
                        )
                    except Exception:
                        strat_signals = []

                    for sig in strat_signals:
                        meta = sig.meta or {}
                        a_type = str(meta.get("alert_type") or "entry")
                        prob = int((meta.get("signal") or {}).get("probability", 0) or 0)
                        price = float(sig.entry)
                        status = str(sig.status)
                        msg = f"{sig.instrument} {sig.direction} M5 {a_type.upper()} ENTRY {price:.6f} PROB {prob}%"

                        candle_time = 0
                        try:
                            candle_time = int(meta.get("candle_time") or 0)
                        except Exception:
                            candle_time = 0
                        key = f"{sig.instrument}:{a_type}:{status}:{candle_time}"
                        if _scanner_last_msg.get(key) == msg:
                            continue
                        _scanner_last_msg[key] = msg

                        meta_json = json.dumps(meta, ensure_ascii=True)
                        _persist_alert(
                            db,
                            sig.instrument,
                            sig.direction,
                            sig.expiry_time,
                            price,
                            status,
                            msg,
                            alert_type=a_type,
                            meta_json=meta_json,
                        )
                        if _should_notify(cfg.notify_channels_json, "telegram") and a_type == "entry":
                            _send_telegram(cfg.notify_telegram_bot_token or "", cfg.notify_telegram_chat_id or "", msg)

                    # Continue with legacy scanners only if no new signals.
                    if strat_signals:
                        continue

                    jade = scan_jade_binary_m5_pulse_strategy(instrument=instrument, candles_m5=candles5)
                    if jade:
                        price = float(jade.entry)
                        status = str(jade.status)
                        prob = int((jade.meta or {}).get('signal', {}).get('probability', 0) or 0)
                        msg = f"{jade.instrument} {jade.direction} M5 ENTRY {price:.6f} PROB {prob}%"

                        candle_time = 0
                        try:
                            candle_time = int((jade.meta or {}).get("candle_time") or 0)
                        except Exception:
                            candle_time = 0
                        key = f"{jade.instrument}:{status}:{candle_time}"
                        if _scanner_last_msg.get(key) == msg:
                            continue
                        _scanner_last_msg[key] = msg

                        meta_json = json.dumps(jade.meta or {}, ensure_ascii=True)
                        _persist_alert(db, jade.instrument, jade.direction, jade.expiry_time, price, status, msg, alert_type=str((jade.meta or {}).get("alert_type") or "entry"), meta_json=meta_json)
                        if _should_notify(cfg.notify_channels_json, "telegram"):
                            _send_telegram(cfg.notify_telegram_bot_token or "", cfg.notify_telegram_chat_id or "", msg)
                        continue

                    oanda = scan_binary_oanda_m5_strategy(instrument=instrument, candles_m5=candles5)
                    if oanda:
                        price = float(oanda.entry)
                        status = str(oanda.status)
                        msg = f"{oanda.instrument} {oanda.direction} M5 ENTRY {price:.6f} PROB {int((oanda.meta or {}).get('signal', {}).get('probability', 0))}%"

                        candle_time = 0
                        try:
                            candle_time = int((oanda.meta or {}).get("candle_time") or 0)
                        except Exception:
                            candle_time = 0
                        key = f"{oanda.instrument}:{status}:{candle_time}"
                        if _scanner_last_msg.get(key) == msg:
                            continue
                        _scanner_last_msg[key] = msg

                        meta_json = json.dumps(oanda.meta or {}, ensure_ascii=True)
                        _persist_alert(db, oanda.instrument, oanda.direction, oanda.expiry_time, price, status, msg, alert_type=str((oanda.meta or {}).get("alert_type") or "entry"), meta_json=meta_json)
                        if _should_notify(cfg.notify_channels_json, "telegram"):
                            _send_telegram(cfg.notify_telegram_bot_token or "", cfg.notify_telegram_chat_id or "", msg)
                        continue

                    test = scan_test_strategy_ema200_stoch(
                        instrument=instrument,
                        expiry_time=expiry_time,
                        candles_base=candles5,
                        stoch_k=cfg.bot_stoch_k,
                        stoch_d=cfg.bot_stoch_d,
                        stoch_slowing=cfg.bot_stoch_slowing,
                        rsi_period=cfg.bot_rsi_period,
                        ema_fast=cfg.bot_ema_fast,
                        ema_slow=cfg.bot_ema_slow,
                        ema_filter=cfg.bot_ema_filter,
                    )
                    if test:
                        price = float(test.entry)
                        status = str(test.status)
                        exp = str(test.expiry_time or "").strip().lower()
                        if exp.endswith("m"):
                            exp = f"{exp[:-1]}MIN"
                        else:
                            exp = exp.upper()
                        msg = f"{test.instrument} {test.direction} {exp} PRICE {price:.6f} {status.upper()}"

                        candle_time = 0
                        try:
                            candle_time = int((test.meta or {}).get("candle_time") or 0)
                        except Exception:
                            candle_time = 0
                        key = f"{test.instrument}:{status}:{candle_time}"
                        if _scanner_last_msg.get(key) == msg:
                            continue
                        _scanner_last_msg[key] = msg

                        meta_json = json.dumps(test.meta or {}, ensure_ascii=True)
                        _persist_alert(db, test.instrument, test.direction, test.expiry_time, price, status, msg, meta_json=meta_json)
                        if _should_notify(cfg.notify_channels_json, "telegram"):
                            _send_telegram(cfg.notify_telegram_bot_token or "", cfg.notify_telegram_chat_id or "", msg)
                        continue
                    candles1, _p1 = fetch_any_candles(instrument=instrument, timeframe="1m", limit=240)
                    candles15, _p15b = fetch_any_candles(instrument=instrument, timeframe="15m", limit=200)

                    q = scan_quant_binary_setup(
                        instrument=instrument,
                        expiry_time=expiry_time,
                        candles_5m=candles5,
                        candles_1m=candles1,
                        candles_15m=candles15,
                        payout=float(cfg.payout_pct_default or 0.80),
                    )
                    if not q or q.status == "no_signal":
                        continue

                    price = float(q.entry)
                    status = str(q.status)
                    exp = str(q.expiry_time or "").strip().lower()
                    if exp.endswith("m"):
                        exp = f"{exp[:-1]}MIN"
                    else:
                        exp = exp.upper()
                    msg = f"{q.instrument} {q.direction} {exp} PRICE {price:.6f} {status.upper()}"

                    candle_time = 0
                    try:
                        candle_time = int((q.meta or {}).get("candle_time") or 0)
                    except Exception:
                        candle_time = 0
                    key = f"{q.instrument}:{status}:{candle_time}"  # once per candle
                    if _scanner_last_msg.get(key) == msg:
                        continue
                    _scanner_last_msg[key] = msg

                    meta_json = json.dumps(q.meta or {}, ensure_ascii=True)
                    _persist_alert(db, q.instrument, q.direction, q.expiry_time, price, status, msg, meta_json=meta_json)
                    if _should_notify(cfg.notify_channels_json, "telegram"):
                        _send_telegram(cfg.notify_telegram_bot_token or "", cfg.notify_telegram_chat_id or "", msg)

        except Exception:
            # Scanner is best-effort.
            pass

        time.sleep(max(5, interval_sec))

@router.post("/analyze")
def analyze_market(instrument: str, candles: List[Dict] = Body(default_factory=list)):
    """Envía velas para que el JADE BOT analice y genere señales."""
    signal = bot.process_market_data(instrument, candles)
    if signal:
        return {"status": "signal_generated", "data": signal}
    return {"status": "no_signal", "message": "No se encontraron patrones de alta probabilidad."}


@router.get("/alerts")
def list_alerts(
    limit: int = 50,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    _ensure_scanner_running()
    rows = db.exec(select(BotAlert).order_by(desc(BotAlert.id)).limit(limit)).all()
    return rows


@router.post("/alerts/purge")
def purge_alerts(
    keep: int = 200,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    keep_n = int(keep) if int(keep) >= 0 else 0
    keep_n = min(10_000, keep_n)
    if keep_n == 0:
        db.exec(text("DELETE FROM botalert"))
        db.commit()
        return {"status": "purged", "kept": 0}

    db.exec(
        text(
            "DELETE FROM botalert WHERE id NOT IN (SELECT id FROM botalert ORDER BY id DESC LIMIT :keep)"
        ),
        {"keep": keep_n},
    )
    db.commit()
    return {"status": "purged", "kept": keep_n}


@router.get("/scanner/status")
def scanner_status(_: User = Depends(get_current_user)):
    with _scanner_lock:
        return dict(_scanner_state)


@router.post("/scanner/start")
def scanner_start(
    interval_sec: int = 300,
    expiry_time: str = "5m",
    _: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    global _scanner_thread, _scanner_stop
    with _scanner_lock:
        if _scanner_state.get("running"):
            _scanner_state["interval_sec"] = int(interval_sec)
            _scanner_state["expiry_time"] = "5m"
            return {"status": "updated", **_scanner_state}

        _scanner_state["interval_sec"] = int(interval_sec)
        _scanner_state["expiry_time"] = "5m"
        _scanner_state["running"] = True
        _scanner_stop = threading.Event()
        _scanner_thread = threading.Thread(target=_scanner_loop, daemon=True)
        _scanner_thread.start()

    msg = f"SCANNER INICIADO interval={interval_sec}s tf=5m"
    _persist_alert(db, instrument="SCANNER", direction="SYSTEM", expiry_time=str(_scanner_state.get('expiry_time')), price=0.0, status="system", msg=msg, alert_type="system")
    return {"status": "started", **_scanner_state}


@router.post("/scanner/stop")
def scanner_stop(
    _: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    global _scanner_stop
    with _scanner_lock:
        if not _scanner_state.get("running"):
            return {"status": "not_running", **_scanner_state}
        if _scanner_stop:
            _scanner_stop.set()
        _scanner_state["running"] = False

    msg = "SCANNER DETENIDO"
    _persist_alert(db, instrument="SCANNER", direction="SYSTEM", expiry_time=str(_scanner_state.get('expiry_time')), price=0.0, status="system", msg=msg, alert_type="system")
    return {"status": "stopped", **_scanner_state}


@router.get("/market/candles")
def get_market_candles(
    instrument: str,
    expiry_time: str,
    limit: int = 200,
    _: User = Depends(get_current_user),
):
    _ensure_scanner_running()
    candles, provider = fetch_any_candles(instrument=instrument, timeframe=expiry_time, limit=limit)
    return {"instrument": instrument, "expiry_time": expiry_time, "candles": candles, "provider": provider}


@router.get("/market/price")
def get_market_price(
    instrument: str,
    _: User = Depends(get_current_user),
):
    _ensure_scanner_running()
    p, provider = fetch_any_price(instrument=instrument)
    if p is None:
        raise HTTPException(status_code=404, detail="Price not available for instrument")
    return {"instrument": instrument, "price": p, "provider": provider, "ts": datetime.now()}


@router.post("/scanner/evaluate")
def scanner_evaluate(
    instrument: str,
    expiry_time: str,
    candles: List[Dict] = Body(default_factory=list),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    cfg = _get_or_create_config(db)

    candles5 = candles or fetch_any_candles(instrument=instrument, timeframe="5m", limit=300)[0]

    # Evaluate the new structural strategy in single-instrument mode.
    price_now, _pp = fetch_any_price(instrument=instrument)
    candles15, _p15 = fetch_any_candles(instrument=instrument, timeframe="15m", limit=240)
    candles1h, _p1h = fetch_any_candles(instrument=instrument, timeframe="1h", limit=240)

    sigs = scan_jade_binary_m5_structural_scalp_strategy(
        instrument=instrument,
        candles_m5=candles5,
        candles_15m=candles15,
        candles_1h=candles1h,
        price_now=price_now,
        # Advanced Parameters from DB
        swing_depth=cfg.bot_swing_depth,
        min_impulse_candles=cfg.bot_min_impulse_candles,
        elliott_w3_ext=cfg.bot_elliott_w3_ext,
        elliott_w4_limit=cfg.bot_elliott_w4_limit,
        fib_margin=cfg.bot_fib_margin,
        prealert_max_time=cfg.bot_prealert_max_time,
        volatility_min=cfg.bot_volatility_min,
        ema_min_slope=cfg.bot_ema_min_slope,
        sideways_filter=cfg.bot_sideways_filter,
        stoch_k=cfg.bot_stoch_k,
        stoch_d=cfg.bot_stoch_d,
        stoch_slowing=cfg.bot_stoch_slowing,
        rsi_period=cfg.bot_rsi_period,
        ema_fast_p=cfg.bot_ema_fast,
        ema_slow_p=cfg.bot_ema_slow,
        ema_filter_p=cfg.bot_ema_filter,
    )
    entry = None
    near = None
    for s in sigs:
        a_type = str((s.meta or {}).get("alert_type") or "")
        if a_type == "entry":
            entry = s
        elif a_type == "near":
            near = s

    chosen = entry or near
    if not chosen:
        return {"status": "no_signal", "message": "NO HAY CONDICIONES ÓPTIMAS EN M5 PARA EXPIRACIÓN DE 5 MINUTOS"}

    meta = chosen.meta or {}
    a_type = str(meta.get("alert_type") or "entry")
    price = float(chosen.entry)
    status = str(chosen.status)
    prob = int((meta.get('signal') or {}).get('probability', 0) or 0)
    msg = f"{chosen.instrument} {chosen.direction} M5 {a_type.upper()} ENTRY {price:.6f} PROB {prob}%"

    meta_json = json.dumps(meta, ensure_ascii=True)
    alert = _persist_alert(db, chosen.instrument, chosen.direction, chosen.expiry_time, price, status, msg, alert_type=a_type, meta_json=meta_json)
    if _should_notify(cfg.notify_channels_json, "telegram"):
        _send_telegram(cfg.notify_telegram_bot_token or "", cfg.notify_telegram_chat_id or "", msg)
    return {"status": status, "alert": alert, "agent_report": chosen.report_text, "meta": meta}

    # fallback legacy scanners below (kept but unreachable while fixed strategy is active)

    base_tf = expiry_time
    test = scan_test_strategy_ema200_stoch(
        instrument=instrument,
        expiry_time=base_tf,
        candles_base=candles5,
        stoch_k=cfg.bot_stoch_k,
        stoch_d=cfg.bot_stoch_d,
        stoch_slowing=cfg.bot_stoch_slowing,
        rsi_period=cfg.bot_rsi_period,
        ema_fast=cfg.bot_ema_fast,
        ema_slow=cfg.bot_ema_slow,
        ema_filter=cfg.bot_ema_filter,
    )
    if test:
        price = float(test.entry)
        status = str(test.status)
        exp = str(test.expiry_time or "").strip().lower()
        if exp.endswith("m"):
            exp = f"{exp[:-1]}MIN"
        else:
            exp = exp.upper()
        msg = f"{test.instrument} {test.direction} {exp} PRICE {price:.6f} {status.upper()}"

        meta_json = json.dumps(test.meta or {}, ensure_ascii=True)
        alert = _persist_alert(db, test.instrument, test.direction, test.expiry_time, price, status, msg, meta_json=meta_json)
        if _should_notify(cfg.notify_channels_json, "telegram"):
            _send_telegram(cfg.notify_telegram_bot_token or "", cfg.notify_telegram_chat_id or "", msg)
        return {"status": status, "alert": alert, "agent_report": test.report_text, "meta": test.meta}

    q = scan_quant_binary_setup(
        instrument=instrument,
        expiry_time=base_tf,
        candles_5m=candles5,
        candles_1m=candles1,
        candles_15m=candles15,
        payout=float(cfg.payout_pct_default or 0.80),
    )
    if not q or q.status == "no_signal":
        return {"status": "no_signal"}

    price = float(q.entry)
    status = str(q.status)
    exp = str(q.expiry_time or "").strip().lower()
    if exp.endswith("m"):
        exp = f"{exp[:-1]}MIN"
    else:
        exp = exp.upper()
    msg = f"{q.instrument} {q.direction} {exp} PRICE {price:.6f} {status.upper()}"

    meta_json = json.dumps(q.meta or {}, ensure_ascii=True)
    alert = _persist_alert(db, q.instrument, q.direction, q.expiry_time, price, status, msg, meta_json=meta_json)

    if _should_notify(cfg.notify_channels_json, "telegram"):
        _send_telegram(cfg.notify_telegram_bot_token or "", cfg.notify_telegram_chat_id or "", msg)

    # WhatsApp pending: requires provider integration.

    return {"status": status, "alert": alert, "agent_report": q.report_text, "meta": q.meta}

@router.post("/train")
def train_ai(db: Session = Depends(get_session)):
    """Inicia el proceso de re-entrenamiento de la IA con el historial de trades."""
    # Obtener historial de trades de la BD
    bin_trades = db.exec(select(TradeBinary)).all()
    # Convertir a formato compatible con el módulo de aprendizaje
    historical_data = [t.dict() for t in bin_trades]
    
    if len(historical_data) < 10:
        raise HTTPException(status_code=400, detail="Historial insuficiente para entrenamiento (mín. 10 trades).")
        
    success = ai_module.train(historical_data)
    if success:
        return {"status": "success", "message": "IA re-entrenada con éxito."}
    return {"status": "error", "message": "Fallo en el entrenamiento."}

@router.get("/prediction")
def get_prediction(instrument: str, session_id: int, investment: float = 10.0):
    """Obtiene la probabilidad proyectada de éxito para una configuración dada."""
    prob = ai_module.predict_success_rate(instrument, session_id, investment)
    return {"instrument": instrument, "session_id": session_id, "probability": prob}
