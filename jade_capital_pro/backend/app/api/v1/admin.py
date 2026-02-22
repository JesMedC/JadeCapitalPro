from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlmodel import Session, select
from typing import List, Optional
from datetime import datetime
import json

from ...db.db import get_session
from ...models.trading import User, UserRole, AppConfig
from ...api.deps import get_current_user
from ...core.security import get_password_hash


router = APIRouter(prefix="/admin", tags=["Admin"])


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No autorizado")
    return current_user


def _normalize_list(values: List[str]) -> List[str]:
    out: List[str] = []
    seen = set()
    for v in values:
        s = (v or "").strip()
        if not s:
            continue
        key = s.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(s)
    return out


def get_or_create_config(db: Session) -> AppConfig:
    cfg = db.get(AppConfig, 1)
    if cfg:
        return cfg

    cfg = AppConfig(id=1, instruments_json="[]", expiry_times_json="[]", daily_projection_pct=0.0)
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return cfg


class ConfigOut(BaseModel):
    instruments: List[str]
    expiry_times: List[str]
    daily_projection_pct: float
    investment_pct_default: float
    payout_pct_default: float
    payout_options: List[float]
    notify_channels: List[str]
    notify_telegram_chat_id: Optional[str] = None
    notify_whatsapp_instance: Optional[str] = None
    notify_whatsapp_numbers: List[str]
    # Bot Alert Parameters
    bot_stoch_k: int
    bot_stoch_d: int
    bot_stoch_slowing: int
    bot_rsi_period: int
    bot_ema_fast: int
    bot_ema_slow: int
    bot_ema_filter: int
    bot_swing_depth: int
    bot_min_impulse_candles: int
    bot_break_tolerance: float
    bot_elliott_w3_ext: float
    bot_elliott_w4_limit: float
    bot_fib_margin: float
    bot_prealert_max_time: int
    bot_volatility_min: float
    bot_ema_min_slope: float
    bot_sideways_filter: bool
    bot_cooldown_mins: int


class ConfigUpdate(BaseModel):
    instruments: List[str] = []
    expiry_times: List[str] = []
    daily_projection_pct: float = 0.0
    investment_pct_default: float = 2.0
    payout_pct_default: float = 0.85
    payout_options: List[float] = [
        0.75, 0.76, 0.77, 0.78, 0.79,
        0.80, 0.81, 0.82, 0.83, 0.84,
        0.85, 0.86, 0.87, 0.88, 0.89,
        0.90, 0.91, 0.92, 0.93, 0.94,
    ]

    # Notifications
    notify_channels: List[str] = ["portal"]
    notify_telegram_bot_token: Optional[str] = None
    notify_telegram_chat_id: Optional[str] = None
    notify_whatsapp_instance: Optional[str] = None
    notify_whatsapp_numbers: List[str] = []
    # Bot Alert Parameters
    bot_stoch_k: int = 5
    bot_stoch_d: int = 3
    bot_stoch_slowing: int = 3
    bot_rsi_period: int = 14
    bot_ema_fast: int = 50
    bot_ema_slow: int = 100
    bot_ema_filter: int = 200
    bot_swing_depth: int = 4
    bot_min_impulse_candles: int = 5
    bot_break_tolerance: float = 0.0001
    bot_elliott_w3_ext: float = 1.618
    bot_elliott_w4_limit: float = 0.382
    bot_fib_margin: float = 0.05
    bot_prealert_max_time: int = 12
    bot_volatility_min: float = 0.0002
    bot_ema_min_slope: float = 0.00005
    bot_sideways_filter: bool = True
    bot_cooldown_mins: int = 15


@router.get("/config", response_model=ConfigOut)
def get_config(
    _: User = Depends(require_admin),
    db: Session = Depends(get_session),
):
    cfg = get_or_create_config(db)
    instruments = json.loads(cfg.instruments_json or "[]")
    expiry_times = json.loads(cfg.expiry_times_json or "[]")
    payout_options = json.loads(cfg.payout_options_json or "[]")
    if (not payout_options) or payout_options == [0.75, 0.8, 0.85, 0.9]:
        payout_options = [round(x / 100, 4) for x in range(75, 95)]
    notify_channels = json.loads(cfg.notify_channels_json or "[\"portal\"]")
    notify_whatsapp_numbers = json.loads(cfg.notify_whatsapp_numbers_json or "[]")
    return {
        "instruments": instruments,
        "expiry_times": expiry_times,
        "daily_projection_pct": cfg.daily_projection_pct,
        "investment_pct_default": cfg.investment_pct_default,
        "payout_pct_default": cfg.payout_pct_default,
        "payout_options": payout_options,
        "notify_channels": notify_channels,
        "notify_telegram_chat_id": cfg.notify_telegram_chat_id,
        "notify_whatsapp_instance": cfg.notify_whatsapp_instance,
        "notify_whatsapp_numbers": notify_whatsapp_numbers,
        "bot_stoch_k": cfg.bot_stoch_k,
        "bot_stoch_d": cfg.bot_stoch_d,
        "bot_stoch_slowing": cfg.bot_stoch_slowing,
        "bot_rsi_period": cfg.bot_rsi_period,
        "bot_ema_fast": cfg.bot_ema_fast,
        "bot_ema_slow": cfg.bot_ema_slow,
        "bot_ema_filter": cfg.bot_ema_filter,
        "bot_swing_depth": cfg.bot_swing_depth,
        "bot_min_impulse_candles": cfg.bot_min_impulse_candles,
        "bot_break_tolerance": cfg.bot_break_tolerance,
        "bot_elliott_w3_ext": cfg.bot_elliott_w3_ext,
        "bot_elliott_w4_limit": cfg.bot_elliott_w4_limit,
        "bot_fib_margin": cfg.bot_fib_margin,
        "bot_prealert_max_time": cfg.bot_prealert_max_time,
        "bot_volatility_min": cfg.bot_volatility_min,
        "bot_ema_min_slope": cfg.bot_ema_min_slope,
        "bot_sideways_filter": cfg.bot_sideways_filter,
        "bot_cooldown_mins": cfg.bot_cooldown_mins,
    }


@router.put("/config", response_model=ConfigOut)
def update_config(
    payload: ConfigUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_session),
):
    cfg = get_or_create_config(db)

    instruments = _normalize_list(payload.instruments)
    expiry_times = _normalize_list(payload.expiry_times)
    daily_projection = float(payload.daily_projection_pct or 0.0)

    notify_channels = _normalize_list(payload.notify_channels)
    notify_whatsapp_numbers = _normalize_list(payload.notify_whatsapp_numbers)

    cfg.instruments_json = json.dumps(instruments)
    cfg.expiry_times_json = json.dumps(expiry_times)
    cfg.daily_projection_pct = daily_projection
    cfg.investment_pct_default = float(payload.investment_pct_default or 0.0)
    cfg.payout_pct_default = float(payload.payout_pct_default or 0.0)
    cfg.payout_options_json = json.dumps([float(x) for x in (payload.payout_options or [])])

    cfg.notify_channels_json = json.dumps(notify_channels)
    cfg.notify_telegram_chat_id = payload.notify_telegram_chat_id
    cfg.notify_whatsapp_instance = payload.notify_whatsapp_instance
    cfg.notify_whatsapp_numbers_json = json.dumps(notify_whatsapp_numbers)

    # Secrets (token) only stored if provided
    if payload.notify_telegram_bot_token is not None:
        cfg.notify_telegram_bot_token = payload.notify_telegram_bot_token
    
    cfg.bot_stoch_k = int(payload.bot_stoch_k)
    cfg.bot_stoch_d = int(payload.bot_stoch_d)
    cfg.bot_stoch_slowing = int(payload.bot_stoch_slowing)
    cfg.bot_rsi_period = int(payload.bot_rsi_period)
    cfg.bot_ema_fast = int(payload.bot_ema_fast)
    cfg.bot_ema_slow = int(payload.bot_ema_slow)
    cfg.bot_ema_filter = int(payload.bot_ema_filter)
    cfg.bot_swing_depth = int(payload.bot_swing_depth)
    cfg.bot_min_impulse_candles = int(payload.bot_min_impulse_candles)
    cfg.bot_break_tolerance = float(payload.bot_break_tolerance)
    cfg.bot_elliott_w3_ext = float(payload.bot_elliott_w3_ext)
    cfg.bot_elliott_w4_limit = float(payload.bot_elliott_w4_limit)
    cfg.bot_fib_margin = float(payload.bot_fib_margin)
    cfg.bot_prealert_max_time = int(payload.bot_prealert_max_time)
    cfg.bot_volatility_min = float(payload.bot_volatility_min)
    cfg.bot_ema_min_slope = float(payload.bot_ema_min_slope)
    cfg.bot_sideways_filter = bool(payload.bot_sideways_filter)
    cfg.bot_cooldown_mins = int(payload.bot_cooldown_mins)

    cfg.updated_at = datetime.now()

    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return {
        "instruments": instruments,
        "expiry_times": expiry_times,
        "daily_projection_pct": cfg.daily_projection_pct,
        "investment_pct_default": cfg.investment_pct_default,
        "payout_pct_default": cfg.payout_pct_default,
        "payout_options": json.loads(cfg.payout_options_json or "[]"),
        "notify_channels": notify_channels,
        "notify_telegram_chat_id": cfg.notify_telegram_chat_id,
        "notify_whatsapp_instance": cfg.notify_whatsapp_instance,
        "notify_whatsapp_numbers": notify_whatsapp_numbers,
        "bot_stoch_k": cfg.bot_stoch_k,
        "bot_stoch_d": cfg.bot_stoch_d,
        "bot_stoch_slowing": cfg.bot_stoch_slowing,
        "bot_rsi_period": cfg.bot_rsi_period,
        "bot_ema_fast": cfg.bot_ema_fast,
        "bot_ema_slow": cfg.bot_ema_slow,
        "bot_ema_filter": cfg.bot_ema_filter,
        "bot_swing_depth": cfg.bot_swing_depth,
        "bot_min_impulse_candles": cfg.bot_min_impulse_candles,
        "bot_break_tolerance": cfg.bot_break_tolerance,
        "bot_elliott_w3_ext": cfg.bot_elliott_w3_ext,
        "bot_elliott_w4_limit": cfg.bot_elliott_w4_limit,
        "bot_fib_margin": cfg.bot_fib_margin,
        "bot_prealert_max_time": cfg.bot_prealert_max_time,
        "bot_volatility_min": cfg.bot_volatility_min,
        "bot_ema_min_slope": cfg.bot_ema_min_slope,
        "bot_sideways_filter": cfg.bot_sideways_filter,
        "bot_cooldown_mins": cfg.bot_cooldown_mins,
    }


class UserOut(BaseModel):
    id: int
    username: str
    email: EmailStr
    role: UserRole
    is_active: bool
    permissions: List[str]


class AdminUserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: UserRole = UserRole.VISOR
    is_active: bool = True
    permissions: List[str] = []


class AdminUserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    permissions: Optional[List[str]] = None


@router.get("/users", response_model=List[UserOut])
def list_users(
    _: User = Depends(require_admin),
    db: Session = Depends(get_session),
):
    users = db.exec(select(User).order_by(User.id)).all()
    out = []
    for u in users:
        out.append({
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "role": u.role,
            "is_active": u.is_active,
            "permissions": json.loads(u.permissions_json or "[]"),
        })
    return out


@router.post("/users", response_model=UserOut)
def create_user(
    payload: AdminUserCreate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_session),
):
    existing_username = db.exec(select(User).where(User.username == payload.username)).first()
    if existing_username:
        raise HTTPException(status_code=400, detail="Username ya existe")

    existing_email = db.exec(select(User).where(User.email == payload.email)).first()
    if existing_email:
        raise HTTPException(status_code=400, detail="Email ya existe")

    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        role=payload.role,
        is_active=payload.is_active,
        permissions_json=json.dumps(_normalize_list(payload.permissions)),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "is_active": user.is_active,
        "permissions": json.loads(user.permissions_json or "[]"),
    }


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: AdminUserUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_session),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if payload.email is not None and payload.email != user.email:
        existing_email = db.exec(select(User).where(User.email == payload.email)).first()
        if existing_email:
            raise HTTPException(status_code=400, detail="Email ya existe")
        user.email = payload.email

    if payload.password is not None:
        user.password_hash = get_password_hash(payload.password)

    if payload.role is not None:
        user.role = payload.role

    if payload.is_active is not None:
        user.is_active = payload.is_active

    if payload.permissions is not None:
        user.permissions_json = json.dumps(_normalize_list(payload.permissions))

    # Evitar bloquearse a si mismo
    if user.id == current_user.id and user.is_active is False:
        raise HTTPException(status_code=400, detail="No puedes desactivar tu propio usuario")

    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "is_active": user.is_active,
        "permissions": json.loads(user.permissions_json or "[]"),
    }


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_session),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propio usuario")

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    db.delete(user)
    db.commit()
    return {"status": "success"}
