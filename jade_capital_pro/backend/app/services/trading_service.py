from sqlalchemy.orm import Session
from ..models.trading import Account, Transaction, TradeBinary, TradeForex, TradeStatus, TransactionType
from .session_service import get_session_id
from datetime import datetime
from typing import Optional


def _coerce_binary_result(result: str) -> TradeStatus:
    r = (result or "").strip().lower()
    if r in {"win", "w"}:
        return TradeStatus.WIN
    if r in {"loss", "l", "lose"}:
        return TradeStatus.LOSS
    if r in {"be", "breakeven", "break_even", "break-even"}:
        return TradeStatus.BE
    raise ValueError("Resultado invalido (usa WIN/LOSS/BE)")

class TradingService:
    
    @staticmethod
    def process_deposit(db: Session, account_id: int, amount: float, notes: Optional[str] = None):
        account = db.query(Account).filter(Account.id == account_id).first()
        if not account:
            raise ValueError("Cuenta no encontrada")
        
        # Actualizar balance
        account.balance += amount
        
        # Registrar transacción
        transaction = Transaction(
            account_id=account_id,
            type=TransactionType.DEPOSIT,
            amount=amount,
            notes=notes
        )
        db.add(transaction)
        db.commit()
        return account

    @staticmethod
    def process_withdrawal(db: Session, account_id: int, amount: float, notes: Optional[str] = None):
        account = db.query(Account).filter(Account.id == account_id).first()
        if not account or account.balance < amount:
            raise ValueError("Balance insuficiente para retiro")
        
        # Actualizar balance
        account.balance -= amount
        
        # Registrar transacción
        transaction = Transaction(
            account_id=account_id,
            type=TransactionType.WITHDRAWAL,
            amount=amount,
            notes=notes
        )
        db.add(transaction)
        db.commit()
        return account

    @staticmethod
    def open_binary_trade(db: Session, account_id: int, data: dict):
        account = db.query(Account).filter(Account.id == account_id).first()
        investment = data.get("investment", account.balance * 0.02) # Default 2%
        
        if account.balance < investment:
            raise ValueError("Balance insuficiente para inversión")
        
        # Descontar inversión inmediatamente
        account.balance -= investment
        
        trade = TradeBinary(
            account_id=account_id,
            instrument=data["instrument"],
            investment=investment,
            payout_pct=data["payout_pct"],
            direction=data["direction"],
            expiry_time=data["expiry_time"],
            session_id=get_session_id(),
            status=TradeStatus.OPEN
        )
        db.add(trade)
        db.commit()
        return trade

    @staticmethod
    def close_binary_trade(db: Session, trade_id: int, result: str):
        trade = db.query(TradeBinary).filter(TradeBinary.id == trade_id).first()
        if not trade:
            raise ValueError("Trade no encontrado")

        if trade.status != TradeStatus.OPEN:
            raise ValueError("El trade ya fue cerrado")

        account = trade.account
        r = (result or "").strip().upper()

        if r == "WIN":
            profit = trade.investment * trade.payout_pct
            account.balance += (trade.investment + profit)
            trade.status = TradeStatus.WIN
        elif r == "LOSS":
            # La inversión ya fue descontada al abrir
            trade.status = TradeStatus.LOSS
        elif r == "BE":
            account.balance += trade.investment
            trade.status = TradeStatus.BE
        else:
            raise ValueError("Resultado invalido (usa WIN/LOSS/BE)")

        trade.close_date = datetime.now()
        db.commit()
        db.refresh(trade)
        return trade

    @staticmethod
    def open_forex_trade(db: Session, account_id: int, data: dict):
        account = db.query(Account).filter(Account.id == account_id).first()
        investment = data["investment"]
        
        if account.balance < investment:
            raise ValueError("Balance insuficiente")
            
        account.balance -= investment
        
        trade = TradeForex(
            account_id=account_id,
            instrument=data["instrument"],
            investment=investment,
            direction=data["direction"],
            entry_price=data["entry_price"],
            stop_loss=data.get("stop_loss"),
            take_profit=data.get("take_profit"),
            session_id=get_session_id(),
            status=TradeStatus.OPEN
        )
        db.add(trade)
        db.commit()
        return trade

    @staticmethod
    def close_forex_trade(db: Session, trade_id: int, pnl_amount: float):
        trade = db.query(TradeForex).filter(TradeForex.id == trade_id).first()
        if not trade:
            raise ValueError("Trade no encontrado")

        if trade.status != TradeStatus.OPEN:
            raise ValueError("El trade ya fue cerrado")

        account = trade.account

        # PNL positivo o negativo
        if pnl_amount > 0:
            trade.status = TradeStatus.WIN
        elif pnl_amount < 0:
            trade.status = TradeStatus.LOSS
        else:
            trade.status = TradeStatus.BE

        # Recupera inversion + diferencial (puede ser negativo)
        account.balance += (trade.investment + pnl_amount)
        trade.pnl = pnl_amount
        trade.close_date = datetime.now()
        db.commit()
        db.refresh(trade)
        return trade


    @staticmethod
    def open_manual_binary_trade(
        db: Session,
        account_id: int,
        instrument: str,
        investment: float,
        payout_pct: float,
        direction: str,
        expiry_time: str,
        notes: Optional[str] = None,
        before_image: Optional[str] = None,
    ):
        account = db.query(Account).filter(Account.id == account_id).first()
        if not account:
            raise ValueError("Cuenta no encontrada")
        if account.balance < investment:
            raise ValueError("Balance insuficiente para inversion")

        # Descontar inversion al abrir
        account.balance -= investment

        trade = TradeBinary(
            account_id=account_id,
            instrument=instrument,
            investment=investment,
            payout_pct=payout_pct,
            direction=direction,
            expiry_time=expiry_time,
            session_id=get_session_id(),
            status=TradeStatus.OPEN,
            open_date=datetime.now(),
            close_date=None,
            notes=notes,
            before_image=before_image,
            after_image=None,
        )
        db.add(trade)
        db.commit()
        db.refresh(trade)
        return trade


    @staticmethod
    def open_manual_forex_trade(
        db: Session,
        account_id: int,
        instrument: str,
        investment: float,
        direction: str,
        entry_price: float,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
        notes: Optional[str] = None,
        before_image: Optional[str] = None,
    ):
        account = db.query(Account).filter(Account.id == account_id).first()
        if not account:
            raise ValueError("Cuenta no encontrada")
        if account.balance < investment:
            raise ValueError("Balance insuficiente")

        # Descontar inversion al abrir
        account.balance -= investment

        trade = TradeForex(
            account_id=account_id,
            instrument=instrument,
            investment=investment,
            direction=direction,
            entry_price=entry_price,
            stop_loss=stop_loss,
            take_profit=take_profit,
            session_id=get_session_id(),
            status=TradeStatus.OPEN,
            pnl=0.0,
            open_date=datetime.now(),
            close_date=None,
            notes=notes,
            before_image=before_image,
            after_image=None,
        )
        db.add(trade)
        db.commit()
        db.refresh(trade)
        return trade


    @staticmethod
    def record_binary_trade(
        db: Session,
        account_id: int,
        instrument: str,
        investment: float,
        payout_pct: float,
        direction: str,
        expiry_time: str,
        result: str,
        notes: Optional[str] = None,
        open_date: Optional[datetime] = None,
        close_date: Optional[datetime] = None,
        before_image: Optional[str] = None,
        after_image: Optional[str] = None,
    ):
        account = db.query(Account).filter(Account.id == account_id).first()
        if not account:
            raise ValueError("Cuenta no encontrada")

        if investment <= 0:
            raise ValueError("La inversion debe ser mayor a 0")
        if account.balance < investment:
            raise ValueError("Balance insuficiente para inversion")

        status = _coerce_binary_result(result)

        # Open: descontar inversion
        account.balance -= investment

        trade = TradeBinary(
            account_id=account_id,
            instrument=instrument,
            investment=investment,
            payout_pct=payout_pct,
            direction=direction,
            expiry_time=expiry_time,
            session_id=get_session_id(),
            status=status,
            open_date=open_date or datetime.now(),
            close_date=close_date or datetime.now(),
            notes=notes,
            before_image=before_image,
            after_image=after_image,
        )
        db.add(trade)

        # Close: liquidar resultado
        if status == TradeStatus.WIN:
            profit = investment * payout_pct
            account.balance += (investment + profit)
        elif status == TradeStatus.BE:
            account.balance += investment

        db.commit()
        db.refresh(trade)
        return trade


    @staticmethod
    def record_forex_trade(
        db: Session,
        account_id: int,
        instrument: str,
        investment: float,
        direction: str,
        entry_price: float,
        pnl_amount: float,
        exit_price: Optional[float] = None,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
        notes: Optional[str] = None,
        open_date: Optional[datetime] = None,
        close_date: Optional[datetime] = None,
        before_image: Optional[str] = None,
        after_image: Optional[str] = None,
    ):
        account = db.query(Account).filter(Account.id == account_id).first()
        if not account:
            raise ValueError("Cuenta no encontrada")

        if investment <= 0:
            raise ValueError("La inversion debe ser mayor a 0")
        if account.balance < investment:
            raise ValueError("Balance insuficiente")

        # Open
        account.balance -= investment

        if pnl_amount > 0:
            status = TradeStatus.WIN
        elif pnl_amount < 0:
            status = TradeStatus.LOSS
        else:
            status = TradeStatus.BE

        trade = TradeForex(
            account_id=account_id,
            instrument=instrument,
            investment=investment,
            direction=direction,
            entry_price=entry_price,
            exit_price=exit_price,
            stop_loss=stop_loss,
            take_profit=take_profit,
            status=status,
            pnl=pnl_amount,
            session_id=get_session_id(),
            open_date=open_date or datetime.now(),
            close_date=close_date or datetime.now(),
            notes=notes,
            before_image=before_image,
            after_image=after_image,
        )
        db.add(trade)

        # Close / settle
        account.balance += (investment + pnl_amount)

        db.commit()
        db.refresh(trade)
        return trade
