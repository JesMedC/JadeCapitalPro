from fastapi import APIRouter, Depends, HTTPException, File, Form, UploadFile
from pydantic import BaseModel
from sqlmodel import Session, select
from sqlalchemy import delete
from typing import List, Optional

from datetime import datetime
from uuid import uuid4
import os
import shutil
import json

from ...db.db import get_session
from ...models.trading import Account, MarketType, TradeBinary, TradeForex, Transaction, User, UserRole, Strategy, AppConfig
from ...services.trading_service import TradingService
from ...services.session_service import get_session_name

from ...api.deps import get_current_user

router = APIRouter(prefix="/trading", tags=["Trading"])


TRADE_UPLOAD_DIR = os.path.join("docs", "trade_uploads")
os.makedirs(TRADE_UPLOAD_DIR, exist_ok=True)

STRATEGY_UPLOAD_DIR = os.path.join("docs", "strategy_uploads")
os.makedirs(STRATEGY_UPLOAD_DIR, exist_ok=True)


def _save_trade_image(file: Optional[UploadFile]) -> Optional[str]:
    if not file or not file.filename:
        return None

    original = os.path.basename(file.filename)
    _, ext = os.path.splitext(original)
    ext = ext.lower()
    allowed = {".png", ".jpg", ".jpeg", ".webp"}
    if ext not in allowed:
        raise HTTPException(status_code=400, detail="Formato de imagen no soportado (png/jpg/jpeg/webp)")

    name = f"{uuid4().hex}{ext}"
    path = os.path.join(TRADE_UPLOAD_DIR, name)
    with open(path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return name


def _save_strategy_image(file: Optional[UploadFile]) -> Optional[str]:
    if not file or not file.filename:
        return None

    original = os.path.basename(file.filename)
    _, ext = os.path.splitext(original)
    ext = ext.lower()
    allowed = {".png", ".jpg", ".jpeg", ".webp"}
    if ext not in allowed:
        raise HTTPException(status_code=400, detail="Formato de imagen no soportado (png/jpg/jpeg/webp)")

    name = f"{uuid4().hex}{ext}"
    path = os.path.join(STRATEGY_UPLOAD_DIR, name)
    with open(path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return name


def _delete_trade_image(filename: Optional[str]) -> None:
    if not filename:
        return
    name = os.path.basename(filename)
    path = os.path.join(TRADE_UPLOAD_DIR, name)
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception:
        # best-effort
        pass


def _get_or_create_config(db: Session) -> AppConfig:
    cfg = db.get(AppConfig, 1)
    if cfg:
        return cfg
    cfg = AppConfig(id=1, instruments_json="[]", expiry_times_json="[]", daily_projection_pct=0.0)
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return cfg


@router.get("/config")
def get_trading_config(
    _: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    cfg = _get_or_create_config(db)
    payout_options = json.loads(cfg.payout_options_json or "[]")
    if (not payout_options) or payout_options == [0.75, 0.8, 0.85, 0.9]:
        payout_options = [round(x / 100, 4) for x in range(75, 95)]

    return {
        "instruments": json.loads(cfg.instruments_json or "[]"),
        "expiry_times": json.loads(cfg.expiry_times_json or "[]"),
        "daily_projection_pct": cfg.daily_projection_pct,
        "investment_pct_default": cfg.investment_pct_default,
        "payout_pct_default": cfg.payout_pct_default,
        "payout_options": payout_options,
    }

@router.post("/accounts", response_model=Account)
def create_account(
    name: str, 
    market_type: MarketType, 
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_session)
):
    new_account = Account(owner_id=current_user.id, name=name, market_type=market_type)
    db.add(new_account)
    db.commit()
    db.refresh(new_account)
    return new_account

@router.get("/accounts", response_model=List[Account])
def get_user_accounts(
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_session)
):
    return db.exec(select(Account).where(Account.owner_id == current_user.id)).all()


@router.delete("/accounts/{account_id}")
def delete_account(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    account = db.get(Account, account_id)
    if not account or account.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado")

    # Explicit cascade delete (SQLite may not enforce FKs).
    db.exec(delete(TradeBinary).where(TradeBinary.account_id == account_id))
    db.exec(delete(TradeForex).where(TradeForex.account_id == account_id))
    db.exec(delete(Transaction).where(Transaction.account_id == account_id))
    db.delete(account)
    db.commit()
    return {"status": "deleted", "account_id": account_id}

@router.post("/accounts/{account_id}/deposit")
def deposit(
    account_id: int, 
    amount: float, 
    notes: str = "Depósito manual",
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_session)
):
    # Verificar que el usuario es el dueño
    account = db.get(Account, account_id)
    if not account or account.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    try:
        return TradingService.process_deposit(db, account_id, amount, notes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/accounts/{account_id}/withdraw")
def withdraw(
    account_id: int,
    amount: float,
    notes: str = "Retiro manual",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    account = db.get(Account, account_id)
    if not account or account.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado")

    try:
        return TradingService.process_withdrawal(db, account_id, amount, notes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/transactions/{account_id}", response_model=List[Transaction])
def get_transactions(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    account = db.get(Account, account_id)
    if not account or account.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    return db.exec(select(Transaction).where(Transaction.account_id == account_id)).all()

@router.get("/trades/{account_id}")
def get_all_trades(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    account = db.get(Account, account_id)
    if not account or account.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    bin_trades = db.exec(select(TradeBinary).where(TradeBinary.account_id == account_id)).all()
    forex_trades = db.exec(select(TradeForex).where(TradeForex.account_id == account_id)).all()
    
    return {
        "binary": bin_trades,
        "forex": forex_trades
    }

@router.post("/trades/binary/open")
def open_binary(
    account_id: int,
    instrument: str,
    investment: float,
    payout_pct: float,
    direction: str,
    expiry: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    account = db.get(Account, account_id)
    if not account or account.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado")
    if account.market_type != MarketType.BINARY:
        raise HTTPException(status_code=400, detail="La cuenta no es binaria")

    data = {
        "instrument": instrument,
        "investment": investment,
        "payout_pct": payout_pct,
        "direction": direction,
        "expiry_time": expiry
    }
    try:
        return TradingService.open_binary_trade(db, account_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/trades/binary/{trade_id}/close")
def close_binary(
    trade_id: int,
    result: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    trade = db.get(TradeBinary, trade_id)
    if not trade:
        raise HTTPException(status_code=404, detail="Trade no encontrado")

    account = db.get(Account, trade.account_id)
    if not account or account.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado")

    return TradingService.close_binary_trade(db, trade_id, result)


@router.delete("/trades/binary/{trade_id}")
def delete_open_binary_trade(
    trade_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    trade = db.get(TradeBinary, trade_id)
    if not trade:
        raise HTTPException(status_code=404, detail="Trade no encontrado")

    account = db.get(Account, trade.account_id)
    if not account or account.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado")

    if str(trade.status).lower() != "open":
        raise HTTPException(status_code=400, detail="Solo se puede eliminar una operacion abierta")

    # Refund investment that was deducted on open.
    account.balance = float(account.balance or 0) + float(trade.investment or 0)
    _delete_trade_image(trade.before_image)
    _delete_trade_image(trade.after_image)
    db.delete(trade)
    db.add(account)
    db.commit()
    return {"status": "deleted", "trade_id": trade_id}


@router.post("/trades/manual/open")
async def open_manual_trade(
    account_id: int = Form(...),
    instrument: str = Form(...),
    investment: float = Form(...),
    direction: str = Form(...),
    notes: Optional[str] = Form(None),

    # Binary fields
    payout_pct: Optional[float] = Form(None),
    expiry_time: Optional[str] = Form(None),

    # Forex fields
    entry_price: Optional[float] = Form(None),
    stop_loss: Optional[float] = Form(None),
    take_profit: Optional[float] = Form(None),

    # Images
    before_image: Optional[UploadFile] = File(None),

    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    account = db.get(Account, account_id)
    if not account or account.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado")

    before_name = _save_trade_image(before_image)

    try:
        if account.market_type == MarketType.BINARY:
            if payout_pct is None or expiry_time is None:
                raise HTTPException(status_code=400, detail="Faltan campos para operacion binaria")

            return TradingService.open_manual_binary_trade(
                db,
                account_id=account_id,
                instrument=instrument,
                investment=investment,
                payout_pct=payout_pct,
                direction=direction,
                expiry_time=expiry_time,
                notes=notes,
                before_image=before_name,
            )

        if entry_price is None:
            raise HTTPException(status_code=400, detail="Falta entry_price para operacion forex")

        return TradingService.open_manual_forex_trade(
            db,
            account_id=account_id,
            instrument=instrument,
            investment=investment,
            direction=direction,
            entry_price=entry_price,
            stop_loss=stop_loss,
            take_profit=take_profit,
            notes=notes,
            before_image=before_name,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/trades/manual/binary/{trade_id}/close")
async def close_manual_binary_trade(
    trade_id: int,
    result: str = Form(...),
    notes: Optional[str] = Form(None),
    after_image: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    trade = db.get(TradeBinary, trade_id)
    if not trade:
        raise HTTPException(status_code=404, detail="Trade no encontrado")

    account = db.get(Account, trade.account_id)
    if not account or account.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado")

    after_name = _save_trade_image(after_image)
    if notes is not None:
        trade.notes = notes
    if after_name is not None:
        trade.after_image = after_name

    try:
        return TradingService.close_binary_trade(db, trade_id, result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/trades/manual/forex/{trade_id}/close")
async def close_manual_forex_trade(
    trade_id: int,
    pnl_amount: float = Form(...),
    exit_price: Optional[float] = Form(None),
    notes: Optional[str] = Form(None),
    after_image: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    trade = db.get(TradeForex, trade_id)
    if not trade:
        raise HTTPException(status_code=404, detail="Trade no encontrado")

    account = db.get(Account, trade.account_id)
    if not account or account.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado")

    after_name = _save_trade_image(after_image)
    if notes is not None:
        trade.notes = notes
    if after_name is not None:
        trade.after_image = after_name
    if exit_price is not None:
        trade.exit_price = exit_price

    try:
        return TradingService.close_forex_trade(db, trade_id, pnl_amount)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/trades/forex/{trade_id}")
def delete_open_forex_trade(
    trade_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    trade = db.get(TradeForex, trade_id)
    if not trade:
        raise HTTPException(status_code=404, detail="Trade no encontrado")

    account = db.get(Account, trade.account_id)
    if not account or account.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado")

    if str(trade.status).lower() != "open":
        raise HTTPException(status_code=400, detail="Solo se puede eliminar una operacion abierta")

    account.balance = float(account.balance or 0) + float(trade.investment or 0)
    _delete_trade_image(trade.before_image)
    _delete_trade_image(trade.after_image)
    db.delete(trade)
    db.add(account)
    db.commit()
    return {"status": "deleted", "trade_id": trade_id}

# --- Módulo de Estrategias ---

@router.get("/strategies", response_model=List[Strategy])
def get_strategies(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    return db.exec(select(Strategy).where(Strategy.user_id == current_user.id)).all()

@router.post("/strategies", response_model=Strategy)
def create_strategy(
    name: str,
    description: str,
    rules: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    strategy = Strategy(user_id=current_user.id, name=name, description=description, rules=rules)
    db.add(strategy)
    db.commit()
    db.refresh(strategy)
    return strategy


@router.post("/strategies/step-image")
async def upload_strategy_step_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {UserRole.ADMIN, UserRole.OPERADOR}:
        raise HTTPException(status_code=403, detail="No autorizado")

    filename = _save_strategy_image(file)
    return {"status": "success", "filename": filename}


class StrategyStep(BaseModel):
    title: str
    description: str
    image: Optional[str] = None


class StrategyCreatePayload(BaseModel):
    name: str
    description: str = ""
    steps: List[StrategyStep]
    is_active: bool = True


class StrategyUpdatePayload(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    steps: Optional[List[StrategyStep]] = None
    is_active: Optional[bool] = None


@router.post("/strategies/json", response_model=Strategy)
def create_strategy_json(
    payload: StrategyCreatePayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    if len(payload.steps) < 1 or len(payload.steps) > 10:
        raise HTTPException(status_code=400, detail="Steps deben ser entre 1 y 10")

    rules = json.dumps({"steps": [s.model_dump() for s in payload.steps]})
    strategy = Strategy(
        user_id=current_user.id,
        name=payload.name,
        description=payload.description,
        rules=rules,
        is_active=payload.is_active,
    )
    db.add(strategy)
    db.commit()
    db.refresh(strategy)
    return strategy


@router.patch("/strategies/{strategy_id}", response_model=Strategy)
def update_strategy_json(
    strategy_id: int,
    payload: StrategyUpdatePayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    strategy = db.get(Strategy, strategy_id)
    if not strategy or strategy.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Estrategia no encontrada")

    if payload.name is not None:
        strategy.name = payload.name
    if payload.description is not None:
        strategy.description = payload.description
    if payload.is_active is not None:
        strategy.is_active = payload.is_active
    if payload.steps is not None:
        if len(payload.steps) < 1 or len(payload.steps) > 10:
            raise HTTPException(status_code=400, detail="Steps deben ser entre 1 y 10")
        strategy.rules = json.dumps({"steps": [s.model_dump() for s in payload.steps]})

    db.add(strategy)
    db.commit()
    db.refresh(strategy)
    return strategy

@router.delete("/strategies/{strategy_id}")
def delete_strategy(
    strategy_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session)
):
    strategy = db.get(Strategy, strategy_id)
    if not strategy or strategy.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Estrategia no encontrada")
    db.delete(strategy)
    db.commit()
    return {"status": "success"}

# --- Módulo de Métricas Inicial ---

@router.get("/metrics/sessions/{account_id}")
def get_session_performance(account_id: int, db: Session = Depends(get_session)):
    # Lógica simple para Demo: Agrupar PnL por sesión
    # 1. Traer todos los trades cerrados de esa cuenta
    trades_bin = db.exec(select(TradeBinary).where(TradeBinary.account_id == account_id)).all()
    
    stats = {1: 0.0, 2: 0.0, 3: 0.0, 4: 0.0}
    for t in trades_bin:
        if t.status == "win":
            pnl = t.investment * t.payout_pct
            stats[t.session_id] += pnl
        elif t.status == "loss":
            stats[t.session_id] -= t.investment
            
    return [{"session": get_session_name(k), "pnl": v} for k, v in stats.items()]
