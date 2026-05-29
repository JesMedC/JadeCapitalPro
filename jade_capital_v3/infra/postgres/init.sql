-- ─────────────────────────────────────────────────────────────
-- JadeCapital v3 — Database Initialization
-- PostgreSQL + TimescaleDB
-- Multi-user from day one
-- ─────────────────────────────────────────────────────────────

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Users & Auth ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username    VARCHAR(50) UNIQUE NOT NULL,
    email       VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    avatar_url  VARCHAR(500),
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roles (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) UNIQUE NOT NULL  -- admin | trader | viewer
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id     INTEGER REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- Default roles
INSERT INTO roles (name) VALUES ('admin'), ('trader'), ('viewer') ON CONFLICT (name) DO NOTHING;

-- ── Trading Accounts ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trading_accounts (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    market_type VARCHAR(20) NOT NULL CHECK (market_type IN ('binary', 'forex')),
    balance     DECIMAL(18, 2) DEFAULT 0,
    currency    VARCHAR(3) DEFAULT 'USD',
    is_default  BOOLEAN DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trading_accounts_user ON trading_accounts(user_id);

CREATE TABLE IF NOT EXISTS account_access (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id  UUID NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_by  UUID REFERENCES users(id),
    access_level VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (access_level IN ('owner', 'editor', 'viewer')),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_account_access_user ON account_access(user_id);
CREATE INDEX idx_account_access_account ON account_access(account_id);

-- ── Trades ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trades_binary (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id  UUID NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
    instrument  VARCHAR(20) NOT NULL,
    direction   VARCHAR(4) NOT NULL CHECK (direction IN ('CALL', 'PUT')),
    investment  DECIMAL(18, 2) NOT NULL,
    payout_pct  DECIMAL(5, 4) NOT NULL,
    expiry_time VARCHAR(5) NOT NULL,
    status      VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'win', 'loss', 'be')),
    open_date   TIMESTAMPTZ DEFAULT NOW(),
    close_date  TIMESTAMPTZ,
    notes       TEXT,
    strategy_id UUID
);

CREATE INDEX idx_trades_binary_user ON trades_binary(user_id);
CREATE INDEX idx_trades_binary_account ON trades_binary(account_id);
CREATE INDEX idx_trades_binary_status ON trades_binary(status);
CREATE INDEX idx_trades_binary_open_date ON trades_binary(open_date DESC);

CREATE TABLE IF NOT EXISTS trades_forex (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id  UUID NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
    instrument  VARCHAR(20) NOT NULL,
    direction   VARCHAR(4) NOT NULL CHECK (direction IN ('BUY', 'SELL')),
    lot_size    DECIMAL(10, 2) DEFAULT 1.0,
    entry_price DECIMAL(18, 5) NOT NULL,
    exit_price  DECIMAL(18, 5),
    stop_loss   DECIMAL(18, 5),
    take_profit DECIMAL(18, 5),
    pnl         DECIMAL(18, 2),
    status      VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
    open_date   TIMESTAMPTZ DEFAULT NOW(),
    close_date  TIMESTAMPTZ,
    notes       TEXT,
    strategy_id UUID
);

CREATE INDEX idx_trades_forex_user ON trades_forex(user_id);
CREATE INDEX idx_trades_forex_account ON trades_forex(account_id);
CREATE INDEX idx_trades_forex_status ON trades_forex(status);

-- ── Journal ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS journal_entries (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id  UUID REFERENCES trading_accounts(id),
    trade_id    UUID,
    entry_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    title       VARCHAR(200) NOT NULL,
    content     TEXT,
    mood        VARCHAR(20),
    tags        TEXT[],
    mistakes    TEXT[],
    lessons     TEXT[],
    ai_summary  TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_journal_user ON journal_entries(user_id);
CREATE INDEX idx_journal_date ON journal_entries(entry_date DESC);

-- ── Goals ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS goals (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id  UUID REFERENCES trading_accounts(id),
    title       VARCHAR(200) NOT NULL,
    goal_type   VARCHAR(30) NOT NULL CHECK (goal_type IN ('pnl', 'winrate', 'trades', 'streak', 'drawdown')),
    target_value DECIMAL(18, 2) NOT NULL,
    current_value DECIMAL(18, 2) DEFAULT 0,
    progress_pct DECIMAL(5, 1) DEFAULT 0,
    is_completed BOOLEAN DEFAULT false,
    is_active   BOOLEAN DEFAULT true,
    start_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date    DATE NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_goals_user ON goals(user_id);
CREATE INDEX idx_goals_active ON goals(is_active);

-- ── Alerts ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS price_alerts (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    instrument  VARCHAR(20) NOT NULL,
    condition   VARCHAR(20) NOT NULL CHECK (condition IN ('above', 'below', 'crosses')),
    price       DECIMAL(18, 5) NOT NULL,
    message     TEXT,
    is_triggered BOOLEAN DEFAULT false,
    triggered_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_price_alerts_user ON price_alerts(user_id);

CREATE TABLE IF NOT EXISTS signal_alerts (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID,
    type        VARCHAR(30) NOT NULL CHECK (type IN ('binary_scanner', 'harmonic_pattern', 'pre_alert', 'entry', 'result')),
    instrument  VARCHAR(20),
    direction   VARCHAR(10),
    entry_price DECIMAL(18, 5),
    score       INTEGER DEFAULT 0,
    pattern_name VARCHAR(50),
    timeframe   VARCHAR(5),
    message     TEXT,
    expires_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_signal_alerts_user ON signal_alerts(user_id);
CREATE INDEX idx_signal_alerts_type ON signal_alerts(type);
CREATE INDEX idx_signal_alerts_created ON signal_alerts(created_at DESC);

-- ── Market Data — Candles (TimescaleDB Hypertable) ─────────

CREATE TABLE IF NOT EXISTS candles (
    time        TIMESTAMPTZ NOT NULL,
    instrument  VARCHAR(20) NOT NULL,
    timeframe   VARCHAR(5) NOT NULL,
    open        DECIMAL(18, 5) NOT NULL,
    high        DECIMAL(18, 5) NOT NULL,
    low         DECIMAL(18, 5) NOT NULL,
    close       DECIMAL(18, 5) NOT NULL,
    volume      BIGINT DEFAULT 0,
    source      VARCHAR(20) DEFAULT 'twelvedata'
);

-- Convert to hypertable (partition by time)
SELECT create_hypertable('candles', 'time', if_not_exists => TRUE,
    chunk_time_interval => INTERVAL '7 days');

-- Compression after 7 days
SELECT add_compression_policy('candles', INTERVAL '7 days', if_not_exists => TRUE);

-- Retention: keep 2 years of data
SELECT add_retention_policy('candles', INTERVAL '2 years', if_not_exists => TRUE);

CREATE INDEX idx_candles_instrument ON candles(instrument, timeframe, time DESC);

-- ── Economic Calendar ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS economic_events (
    id          VARCHAR(50) PRIMARY KEY,
    date        DATE NOT NULL,
    time        TIME,
    country     VARCHAR(50),
    currency    VARCHAR(5),
    impact      VARCHAR(10) NOT NULL CHECK (impact IN ('low', 'medium', 'high')),
    title       VARCHAR(300) NOT NULL,
    forecast    VARCHAR(50),
    previous    VARCHAR(50),
    actual      VARCHAR(50),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_economic_events_date ON economic_events(date);

-- ── Strategies ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS strategies (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    market_type VARCHAR(20) CHECK (market_type IN ('binary', 'forex')),
    rules       JSONB DEFAULT '{}',
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_strategies_user ON strategies(user_id);

-- ── Backtest Sessions ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS backtest_sessions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    instrument  VARCHAR(20) NOT NULL,
    timeframe   VARCHAR(5) NOT NULL,
    start_date  DATE NOT NULL,
    end_date    DATE NOT NULL,
    config      JSONB DEFAULT '{}',
    results     JSONB DEFAULT '{}',
    status      VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_backtest_user ON backtest_sessions(user_id);

-- ── Agent Memory ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_memory (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id  VARCHAR(100),
    role        VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'fact')),
    content     TEXT NOT NULL,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_memory_user ON agent_memory(user_id);
CREATE INDEX idx_agent_memory_session ON agent_memory(session_id);

-- ── User Settings ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_settings (
    user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme       VARCHAR(10) DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
    language    VARCHAR(5) DEFAULT 'es',
    timezone    VARCHAR(50) DEFAULT 'America/Argentina/Buenos_Aires',
    risk_config JSONB DEFAULT '{"max_daily_loss_pct": 5, "max_trades_session": 20, "default_risk_pct": 2}',
    scanner_config JSONB DEFAULT '{"instruments": ["EUR/USD","GBP/USD","USD/JPY"], "interval_minutes": 5}',
    notification_prefs JSONB DEFAULT '{"email": true, "push": true, "sound": true}',
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Refresh Token Blacklist ─────────────────────────────────

CREATE TABLE IF NOT EXISTS token_blacklist (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_jti   VARCHAR(255) UNIQUE NOT NULL,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_token_blacklist_jti ON token_blacklist(token_jti);

-- ── Sprint 4: Chart Preferences ─────────────────────────────

-- Add chart_prefs JSONB column to user_settings (idempotent)
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS chart_prefs JSONB
  DEFAULT '{"instrument": "EUR/USD", "timeframe": "5m"}';

-- Backfill existing rows that received NULL instead of the default
UPDATE user_settings
  SET chart_prefs = '{"instrument": "EUR/USD", "timeframe": "5m"}'
  WHERE chart_prefs IS NULL;

-- ── Sprint 7: Watchlist ─────────────────────────────────────

-- Add watchlist JSONB column to user_settings (idempotent)
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS watchlist JSONB
  NOT NULL DEFAULT '["EUR/USD","GBP/USD","USD/JPY"]'::jsonb;

-- Backfill rows that may have received NULL (pre-migration)
UPDATE user_settings
  SET watchlist = '["EUR/USD","GBP/USD","USD/JPY"]'::jsonb
  WHERE watchlist IS NULL;

-- ── Done ────────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'JadeCapital v3 database initialized — multi-user ready.'; END $$;
