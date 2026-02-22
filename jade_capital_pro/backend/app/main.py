from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlmodel import SQLModel, Session, select
import os

from .db.db import engine, get_session, ensure_sqlite_schema
from .models.trading import User, Account, UserRole
from .core.security import get_password_hash, verify_password, create_access_token
from .schemas.auth import UserCreate, UserLogin, Token
from .api.v1.trading import router as trading_router
from .api.v1.bot import router as bot_router
from .api.v1.knowledge import router as knowledge_router
from .api.v1.auth import router as auth_router
from .api.v1.admin import router as admin_router

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

app = FastAPI(title="Jade Capital Pro API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    create_db_and_tables()
    ensure_sqlite_schema()


# Serve uploaded trade images
os.makedirs("docs/trade_uploads", exist_ok=True)
os.makedirs("docs/knowledge_base/uploads", exist_ok=True)
os.makedirs("docs/strategy_uploads", exist_ok=True)
app.mount(
    "/media/trades",
    StaticFiles(directory="docs/trade_uploads"),
    name="trade_media",
)

app.mount(
    "/media/knowledge",
    StaticFiles(directory="docs/knowledge_base/uploads"),
    name="knowledge_media",
)

app.mount(
    "/media/strategy",
    StaticFiles(directory="docs/strategy_uploads"),
    name="strategy_media",
)

# Register Routers
app.include_router(trading_router, prefix="/api/v1")
app.include_router(bot_router, prefix="/api/v1")
app.include_router(knowledge_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")

# --- SERVER STATUS ---

@app.get("/")
def read_root():
    return {"status": "JADE CAPITAL PRO API IS ONLINE", "version": "2.0.0"}
