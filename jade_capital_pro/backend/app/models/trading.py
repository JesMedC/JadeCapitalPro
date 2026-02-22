from datetime import datetime
from enum import Enum
from typing import Optional, List
from sqlmodel import Field, Relationship, SQLModel

# --- ENUMS ---

class UserRole(str, Enum):
    ADMIN = "admin"
    OPERADOR = "operador"
    VISOR = "visor"

class MarketType(str, Enum):
    FOREX = "forex"
    BINARY = "binary"

class TradeStatus(str, Enum):
    OPEN = "open"
    WIN = "win"
    LOSS = "loss"
    BE = "be"
    CLOSED = "closed"

class TransactionType(str, Enum):
    DEPOSIT = "deposit"
    WITHDRAWAL = "withdrawal"

# --- MODELS ---

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True)
    email: str = Field(unique=True)
    password_hash: str
    role: UserRole = Field(default=UserRole.VISOR)
    is_active: bool = Field(default=True)
    permissions_json: str = Field(default="[]")
    
    accounts: List["Account"] = Relationship(back_populates="owner")

class Account(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    owner_id: int = Field(foreign_key="user.id")
    name: str
    market_type: MarketType
    balance: float = Field(default=0.0)
    currency: str = Field(default="USD")
    created_at: datetime = Field(default_factory=datetime.now)

    owner: User = Relationship(back_populates="accounts")
    transactions: List["Transaction"] = Relationship(back_populates="account")
    trades_binary: List["TradeBinary"] = Relationship(back_populates="account")
    trades_forex: List["TradeForex"] = Relationship(back_populates="account")

class Transaction(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="account.id")
    type: TransactionType
    amount: float
    date: datetime = Field(default_factory=datetime.now)
    notes: Optional[str] = None

    account: Account = Relationship(back_populates="transactions")

class TradeBinary(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="account.id")
    instrument: str
    investment: float
    payout_pct: float # 0.75 to 0.95
    direction: str # "CALL" or "PUT"
    expiry_time: str # "1 min", "5 min", etc.
    status: TradeStatus = Field(default=TradeStatus.OPEN)
    
    open_date: datetime = Field(default_factory=datetime.now)
    close_date: Optional[datetime] = None
    session_id: int # 1, 2, 3, 4
    notes: Optional[str] = None

    before_image: Optional[str] = None
    after_image: Optional[str] = None

    account: Account = Relationship(back_populates="trades_binary")

class TradeForex(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="account.id")
    instrument: str
    investment: float # Capital committed/leveraged margin
    direction: str # "BUY" or "SELL"
    entry_price: float
    exit_price: Optional[float] = None
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    
    status: TradeStatus = Field(default=TradeStatus.OPEN)
    pnl: float = Field(default=0.0)
    
    open_date: datetime = Field(default_factory=datetime.now)
    close_date: Optional[datetime] = None
    session_id: int # 1, 2, 3, 4
    notes: Optional[str] = None

    before_image: Optional[str] = None
    after_image: Optional[str] = None

    account: Account = Relationship(back_populates="trades_forex")

class Strategy(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    name: str
    description: str
    rules: str # JSON or plain text
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.now)


class AppConfig(SQLModel, table=True):
    id: Optional[int] = Field(default=1, primary_key=True)
    instruments_json: str = Field(default="[]")
    expiry_times_json: str = Field(default="[]")
    daily_projection_pct: float = Field(default=0.0)

    investment_pct_default: float = Field(default=2.0)

    payout_pct_default: float = Field(default=0.85)
    # Default allowed payouts: 75%..94% inclusive.
    payout_options_json: str = Field(
        default="[0.75,0.76,0.77,0.78,0.79,0.8,0.81,0.82,0.83,0.84,0.85,0.86,0.87,0.88,0.89,0.9,0.91,0.92,0.93,0.94]"
    )

    notify_telegram_bot_token: Optional[str] = Field(default=None)
    notify_telegram_chat_id: Optional[str] = Field(default=None)
    notify_whatsapp_instance: Optional[str] = Field(default=None)
    notify_whatsapp_numbers_json: str = Field(default="[]")
    notify_channels_json: str = Field(default='["portal"]')

    # Bot Alert Parameters (Basic)
    bot_stoch_k: int = Field(default=5)
    bot_stoch_d: int = Field(default=3)
    bot_stoch_slowing: int = Field(default=3)
    bot_rsi_period: int = Field(default=14)
    bot_ema_fast: int = Field(default=50) # Changed to reflect user request (50, 100, 200)
    bot_ema_slow: int = Field(default=100)
    bot_ema_filter: int = Field(default=200)

    # Advanced Bot Parameters (Elliott & Structure)
    bot_swing_depth: int = Field(default=4)
    bot_min_impulse_candles: int = Field(default=5)
    bot_break_tolerance: float = Field(default=0.0001)
    bot_elliott_w3_ext: float = Field(default=1.618)
    bot_elliott_w4_limit: float = Field(default=0.382)
    bot_fib_margin: float = Field(default=0.05)
    bot_prealert_max_time: int = Field(default=12) # candles
    bot_volatility_min: float = Field(default=0.0002)
    bot_ema_min_slope: float = Field(default=0.00005)
    bot_sideways_filter: bool = Field(default=True)
    bot_cooldown_mins: int = Field(default=15)

    updated_at: datetime = Field(default_factory=datetime.now)


class BotAlert(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    instrument: str
    direction: str
    expiry_time: str
    price: float
    status: str  # evaluation | confirmed
    message: str
    alert_type: str = Field(default="entry")  # near | entry | system
    meta_json: str = Field(default="{}")
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
