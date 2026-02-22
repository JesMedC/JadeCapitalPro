from sqlmodel import Session, create_engine
from typing import Generator

sqlite_url = "sqlite:///./jade_pro.db"
engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})

def get_session() -> Generator:
    with Session(engine) as session:
        yield session


def ensure_sqlite_schema() -> None:
    """Best-effort schema upgrades for SQLite (no alembic migrations)."""

    # Only applies to SQLite.
    if not str(engine.url).startswith("sqlite"):
        return

    def ensure_columns(table: str, columns: dict[str, str]) -> None:
        with engine.begin() as conn:
            rows = conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
            if not rows:
                # Table may not exist yet (e.g. model not imported); skip best-effort upgrade.
                return
            existing = {r[1] for r in rows}  # (cid, name, type, notnull, dflt, pk)
            for name, sql_type in columns.items():
                if name in existing:
                    continue
                conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {name} {sql_type}")

    ensure_columns("tradebinary", {"before_image": "TEXT", "after_image": "TEXT"})
    ensure_columns("tradeforex", {"before_image": "TEXT", "after_image": "TEXT"})

    ensure_columns("user", {"permissions_json": "TEXT"})

    ensure_columns(
        "appconfig",
        {
            "investment_pct_default": "REAL",
            "payout_pct_default": "REAL",
            "payout_options_json": "TEXT",
            "notify_telegram_bot_token": "TEXT",
            "notify_telegram_chat_id": "TEXT",
            "notify_whatsapp_instance": "TEXT",
            "notify_whatsapp_numbers_json": "TEXT",
            "notify_channels_json": "TEXT",
        },
    )

    ensure_columns(
        "botalert",
        {
            "meta_json": "TEXT",
            "alert_type": "TEXT",
        },
    )
