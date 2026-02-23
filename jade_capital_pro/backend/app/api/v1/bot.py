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
_results_thread: threading.Thread | None = None
_scanner_last_msg: dict[str, str] = {}

_ctx_cache: dict[str, dict[str, object]] = {}


def _ensure_scanner_running(default_interval_sec: int = 60) -> None:
    global _scanner_thread, _scanner_stop, _results_thread
    with _scanner_lock:
        if not (_scanner_state.get("running") and _scanner_thread and _scanner_thread.is_alive()):
            _scanner_state["interval_sec"] = int(default_interval_sec)
            _scanner_state["expiry_time"] = "5m"
            _scanner_state["running"] = True
            _scanner_stop = threading.Event()
            _scanner_thread = threading.Thread(target=_scanner_loop, daemon=True)
            _scanner_thread.start()
            
        if not (_results_thread and _results_thread.is_alive()):
            _results_thread = threading.Thread(target=_results_monitor_loop, daemon=True)
            _results_thread.start()


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
    try:
        requests.post(url, json={"chat_id": chat_id, "text": text}, timeout=10)
    except Exception:
        pass


def _send_whatsapp(apikey: str, phones: List[str], text: str) -> None:
    if not apikey or not phones:
        return
    for phone in phones:
        # CallMeBot WhatsApp API
        url = f"https://api.callmebot.com/whatsapp.php?phone={phone}&text={requests.utils.quote(text)}&apikey={apikey}"
        try:
            requests.get(url, timeout=10)
        except Exception:
            pass


@router.post("/notify/test")
def test_notifications(
    _: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    cfg = _get_or_create_config(db)
    msg = "🚀 JADE CAPITAL: Mensaje de prueba de notificaciones."
    
    results = {}
    
    if _should_notify(cfg.notify_channels_json, "telegram"):
        _send_telegram(cfg.notify_telegram_bot_token or "", cfg.notify_telegram_chat_id or "", msg)
        results["telegram"] = "Sent"
        
    if _should_notify(cfg.notify_channels_json, "whatsapp"):
        phones = json.loads(cfg.notify_whatsapp_numbers_json or "[]")
        _send_whatsapp(cfg.notify_whatsapp_instance or "", phones, msg)
        results["whatsapp"] = "Sent"
        
    return {"status": "ok", "delivered": results}


def _format_alert_content(sig_instrument, sig_direction, price, prob, a_type, rsi, filters="200 Velas + RSI"):
    rsi_val = int(rsi) if rsi else 0
    rsi_state = "Neutral"
    if rsi_val < 30: rsi_state = "Oversold"
    elif rsi_val > 70: rsi_state = "Overbought"
    
    if a_type == "near":
        return f"""⚠️ PREPARA OPERACIÓN ⚠️

💎 Instrumento: {sig_instrument}
📈 Acción Sugerida: {sig_direction}
🎯 Precio Actual: {price:.5f}
📊 Filtro: {filters}
📉 RSI: {rsi_val} ({rsi_state})
⏱️ Expiración Sugerida: 5 MIN
⭐ Accuracy Estimado: {prob}%

🔍 Estado: Esperando confirmación..."""
    else:
        return f"""🔥 CONFIRMADO - ENTRA AHORA! 🔥

💎 Instrumento: {sig_instrument}
📈 Acción: {sig_direction}
🎯 Precio Entrada: {price:.5f}
📊 Filtro: {filters}
📉 RSI: {rsi_val} ({rsi_state})
⏱️ Expiración: 5 MIN
⭐ Accuracy: {prob}%

✅ Todas las confirmaciones OK - EJECUTAR TRADE"""


def _results_monitor_loop() -> None:
    from datetime import timedelta
    while True:
        try:
            with Session(engine) as db:
                now = datetime.now()
                # Check alerts created 5 to 20 minutes ago that are still in 'entry' or 'confirmed' status
                statement = select(BotAlert).where(
                    BotAlert.alert_type == "entry",
                    BotAlert.status.in_(["entry", "confirmed"]),
                    BotAlert.created_at <= (now - timedelta(minutes=5)),
                    BotAlert.created_at >= (now - timedelta(minutes=20))
                )
                pending = db.exec(statement).all()
                if pending:
                    cfg = _get_or_create_config(db)
                    for alert in pending:
                        px, _ = fetch_any_price(alert.instrument)
                        if px is None:
                            # If price is unavailable, we might want to skip or retry later
                            continue
                            
                        dir_lower = alert.direction.lower()
                        is_call = "call" in dir_lower or "compra" in dir_lower or "up" in dir_lower or "comprar" in dir_lower
                        
                        entry_price = float(alert.price)
                        final_price = float(px)
                        
                        win = (is_call and final_price > entry_price) or (not is_call and final_price < entry_price)
                        result = "win" if win else "loss"
                        
                        symbol = "✅" if win else "❌"
                        status_text = "WIN ✅" if win else "LOSS ❌"
                        
                        msg = f"""{symbol} {result.upper()} - admin Alerts

💎 Instrumento: {alert.instrument}
📈 Acción: {alert.direction}
🎯 Precio Entrada: {entry_price:.5f}
🎯 Precio Cierre: {final_price:.5f}
📊 Estado: {status_text}"""

                        if _should_notify(cfg.notify_channels_json, "telegram"):
                            _send_telegram(cfg.notify_telegram_bot_token or "", cfg.notify_telegram_chat_id or "", msg)
                            
                        if _should_notify(cfg.notify_channels_json, "whatsapp"):
                            phones = json.loads(cfg.notify_whatsapp_numbers_json or "[]")
                            _send_whatsapp(cfg.notify_whatsapp_instance or "", phones, msg)
                            
                        alert.status = result
                        alert.updated_at = datetime.now()
                        db.add(alert)
                        print(f"[RESULTS] Alert {alert.id} ({alert.instrument}) evaluated as {result.upper()}")
                    db.commit()
        except Exception as e:
            print(f"[RESULTS] Error in monitor loop: {str(e)}")
        time.sleep(30)


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
    # User request: block new cycle until previous is complete (near -> entry -> result)
    # We check if there's ANY alert for this instrument that isn't finished (win/loss) in the last cooldown period
    statement = select(BotAlert).where(
        BotAlert.instrument == instrument,
        BotAlert.status.in_(["near", "entry", "confirmed"]),
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
                            rsi_up=cfg.bot_rsi_up,
                            rsi_down=cfg.bot_rsi_down,
                            stoch_up=cfg.bot_stoch_up,
                            stoch_down=cfg.bot_stoch_down,
                            entry_rsi_up=cfg.bot_entry_rsi_up,
                            entry_rsi_down=cfg.bot_entry_rsi_down,
                            entry_stoch_up=cfg.bot_entry_stoch_up,
                            entry_stoch_down=cfg.bot_entry_stoch_down,
                        )
                    except Exception:
                        strat_signals = []

                    for sig in strat_signals:
                        meta = sig.meta or {}
                        a_type = str(meta.get("alert_type") or "entry")
                        
                        # ENFORCE: No 'entry' without a previous 'near'
                        if a_type == "entry":
                            # Check if we sent a 'near' for this instrument in the last 30 mins
                            from datetime import timedelta
                            cutoff = datetime.now() - timedelta(minutes=30)
                            statement = select(BotAlert).where(
                                BotAlert.instrument == sig.instrument,
                                BotAlert.alert_type == "near",
                                BotAlert.created_at >= cutoff
                            )
                            has_near = db.exec(statement).first()
                            if not has_near:
                                # Skip entry if no near was sent
                                continue

                        prob = int((meta.get("signal") or {}).get("probability", 0) or 0)

                        price = float(sig.entry)
                        status = str(sig.status)
                        rsi = meta.get("indicators", {}).get("rsi", 0)
                        msg = _format_alert_content(sig.instrument, sig.direction, price, prob, a_type, rsi)

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
                        if _should_notify(cfg.notify_channels_json, "telegram"):
                            _send_telegram(cfg.notify_telegram_bot_token or "", cfg.notify_telegram_chat_id or "", msg)
                        
                        if _should_notify(cfg.notify_channels_json, "whatsapp"):
                            phones = json.loads(cfg.notify_whatsapp_numbers_json or "[]")
                            _send_whatsapp(cfg.notify_whatsapp_instance or "", phones, msg)

                    # Continue with legacy scanners only if no new signals.
                    if strat_signals:
                        continue

                    jade = scan_jade_binary_m5_pulse_strategy(instrument=instrument, candles_m5=candles5)
                    if jade:
                        price = float(jade.entry)
                        status = str(jade.status)
                        prob = int((jade.meta or {}).get('signal', {}).get('probability', 0) or 0)
                        rsi = (jade.meta or {}).get('indicators', {}).get('rsi', 0)
                        msg = _format_alert_content(jade.instrument, jade.direction, price, prob, "entry", rsi, filters="JADE PULSE M5")

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
                        if _should_notify(cfg.notify_channels_json, "whatsapp"):
                            phones = json.loads(cfg.notify_whatsapp_numbers_json or "[]")
                            _send_whatsapp(cfg.notify_whatsapp_instance or "", phones, msg)
                        continue

                    oanda = scan_binary_oanda_m5_strategy(instrument=instrument, candles_m5=candles5)
                    if oanda:
                        price = float(oanda.entry)
                        status = str(oanda.status)
                        prob = int((oanda.meta or {}).get('signal', {}).get('probability', 0) or 0)
                        rsi = (oanda.meta or {}).get('indicators', {}).get('rsi', 0)
                        msg = _format_alert_content(oanda.instrument, oanda.direction, price, prob, "entry", rsi, filters="OANDA M5 STRAT")

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
                        if _should_notify(cfg.notify_channels_json, "whatsapp"):
                            phones = json.loads(cfg.notify_whatsapp_numbers_json or "[]")
                            _send_whatsapp(cfg.notify_whatsapp_instance or "", phones, msg)
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
                        prob = int((test.meta or {}).get('signal', {}).get('probability', 0) or 80)
                        rsi = (test.meta or {}).get('indicators', {}).get('rsi', 0)
                        msg = _format_alert_content(test.instrument, test.direction, price, prob, "entry", rsi, filters=f"EMA {cfg.bot_ema_fast}/{cfg.bot_ema_slow}/{cfg.bot_ema_filter}")

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
                        if _should_notify(cfg.notify_channels_json, "whatsapp"):
                            phones = json.loads(cfg.notify_whatsapp_numbers_json or "[]")
                            _send_whatsapp(cfg.notify_whatsapp_instance or "", phones, msg)
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
                    prob = int((q.meta or {}).get('signal', {}).get('probability', 0) or 85)
                    rsi = (q.meta or {}).get('indicators', {}).get('rsi', 0)
                    msg = _format_alert_content(q.instrument, q.direction, price, prob, "entry", rsi, filters="QUANT BINARY SETUP")

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
                    if _should_notify(cfg.notify_channels_json, "whatsapp"):
                        phones = json.loads(cfg.notify_whatsapp_numbers_json or "[]")
                        _send_whatsapp(cfg.notify_whatsapp_instance or "", phones, msg)

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
        rsi_up=cfg.bot_rsi_up,
        rsi_down=cfg.bot_rsi_down,
        stoch_up=cfg.bot_stoch_up,
        stoch_down=cfg.bot_stoch_down,
        entry_rsi_up=cfg.bot_entry_rsi_up,
        entry_rsi_down=cfg.bot_entry_rsi_down,
        entry_stoch_up=cfg.bot_entry_stoch_up,
        entry_stoch_down=cfg.bot_entry_stoch_down,
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
    rsi = meta.get("indicators", {}).get("rsi", 0)
    msg = _format_alert_content(chosen.instrument, chosen.direction, price, prob, a_type, rsi)

    meta_json = json.dumps(meta, ensure_ascii=True)
    alert = _persist_alert(db, chosen.instrument, chosen.direction, chosen.expiry_time, price, status, msg, alert_type=a_type, meta_json=meta_json)
    if _should_notify(cfg.notify_channels_json, "telegram"):
        _send_telegram(cfg.notify_telegram_bot_token or "", cfg.notify_telegram_chat_id or "", msg)
    if _should_notify(cfg.notify_channels_json, "whatsapp"):
        phones = json.loads(cfg.notify_whatsapp_numbers_json or "[]")
        _send_whatsapp(cfg.notify_whatsapp_instance or "", phones, msg)
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
@router.post("/alerts/{alert_id}/notify-result")
def notify_alert_result(
    alert_id: int,
    result: str = Body(..., embed=True), # 'win' or 'loss'
    db: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    alert = db.get(BotAlert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    cfg = _get_or_create_config(db)
    
    symbol = "✅" if result == "win" else "❌"
    status_text = "WIN ✅" if result == "win" else "LOSS ❌"
    
    msg = f"""{symbol} {result.upper()} - admin Alerts

💎 Instrumento: {alert.instrument}
📈 Acción: {alert.direction}
🎯 Precio Entrada: {alert.price:.5f}
📊 Estado: {status_text}"""

    if _should_notify(cfg.notify_channels_json, "telegram"):
        _send_telegram(cfg.notify_telegram_bot_token or "", cfg.notify_telegram_chat_id or "", msg)
        
    if _should_notify(cfg.notify_channels_json, "whatsapp"):
        phones = json.loads(cfg.notify_whatsapp_numbers_json or "[]")
        _send_whatsapp(cfg.notify_whatsapp_instance or "", phones, msg)
    
    # Persist the result in the database status
    alert.status = result
    alert.updated_at = datetime.now()
    db.add(alert)
    db.commit()
        
    return {"status": "ok"}
    

@router.get("/currency-strength")
def get_currency_strength():
    """Monitorea la fuerza de las 8 monedas principales: USD, EUR, JPY, GBP, CAD, NZD, AUD, CHF."""
    currencies = ["USD", "EUR", "JPY", "GBP", "CAD", "NZD", "AUD", "CHF"]
    scores = {c: 0.0 for c in currencies}
    
    # Pares base contra USD para derivar fuerza relativa
    pairs = [
        ("EUR/USD", True),
        ("GBP/USD", True),
        ("AUD/USD", True),
        ("NZD/USD", True),
        ("USD/JPY", False),
        ("USD/CAD", False),
        ("USD/CHF", False),
    ]
    
    for pair_name, base_is_curr in pairs:
        try:
            # Obtener velas diarias para ver el desempeño del día
            candles, _ = fetch_any_candles(pair_name, "1d", limit=1)
            if not candles: continue
            
            # Calculamos el % de cambio del día (Open vs Close actual)
            last = candles[-1]
            o = float(last["open"])
            c = float(last["close"])
            if o == 0: continue
            
            p_change = ((c - o) / o) * 100.0
            
            base, quote = pair_name.split("/")
            scores[base] += p_change
            scores[quote] -= p_change
        except Exception:
            continue
            
    vals = list(scores.values())
    if not vals: 
        return {"strength": [], "best_pairs": []}
    
    min_v = min(vals)
    max_v = max(vals)
    rng = max_v - min_v
    
    results = []
    for c in currencies:
        val = ((scores[c] - min_v) / rng * 10) if rng != 0 else 5.0
        results.append({
            "currency": c, 
            "score": round(val, 1), 
            "raw": round(scores[c], 3)
        })
    
    # Ordenar por fuerza descendente
    results.sort(key=lambda x: x["score"], reverse=True)
    
    # Identificar mejores pares (Más fuerte contra más débil)
    best_pairs = []
    if len(results) >= 2:
        # Top 1
        s1 = results[0]
        w1 = results[-1]
        best_pairs.append({
            "pair": f"{s1['currency']}/{w1['currency']}",
            "direction": "CALL",
            "strength": f"{s1['score']} vs {w1['score']}",
            "type": "TREND"
        })
        # Top 2
        s2 = results[1]
        w2 = results[-2]
        best_pairs.append({
            "pair": f"{s2['currency']}/{w2['currency']}",
            "direction": "CALL",
            "strength": f"{s2['score']} vs {w2['score']}",
            "type": "POTENTIAL"
        })
        
    return {
        "strength": results,
        "best_pairs": best_pairs,
        "timestamp": datetime.now().isoformat()
    }
