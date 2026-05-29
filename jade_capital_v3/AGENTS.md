# JadeCapital v3 — AI Agent Context

> **Stack**: Flutter 3.41 + NestJS + PostgreSQL/TimescaleDB + Redis + Docker
> **Architecture**: NestJS Monolith → Flutter Client → WebSocket Real-time
> **Auth**: JWT + Roles (admin | trader | viewer)
> **SDD**: `openspec/changes/jade-capital-v3-scaffold/`

---

## Quick Start (When You Come Back)

```bash
cd /Users/jesus.medina/Desktop/JadeCapitalPro/jade_capital_v3
docker compose up -d                    # PostgreSQL + Redis
cd backend && npm run start:dev         # NestJS :3000
cd frontend && flutter run -d chrome    # Flutter Web :8080
```

---

## Tech Stack

| Layer | Tech | Why |
|-------|------|-----|
| Frontend | Flutter + Riverpod | Multi-platform (web/mobile/desktop) |
| Backend | NestJS (TypeScript) | Modules, guards, WebSocket native |
| Database | PostgreSQL 14 + TimescaleDB | Hypertables for candles |
| Cache | Redis 7 | Sessions + Bull queues + pub/sub |
| Real-time | WebSocket (socket.io) | Per-user rooms |
| Charts | TradingView via WebView | Professional, no reinvention |
| Auth | JWT (access + refresh) | Stateless, multi-tenant |
| Infra | Docker Compose + nginx | Single command up |

---

## Directory Structure

```
jade_capital_v3/
├── docker-compose.yml
├── backend/                    # NestJS
│   └── src/
│       ├── modules/
│       │   ├── auth/           # JWT, guards, roles
│       │   ├── users/          # CRUD, profiles
│       │   ├── accounts/       # Trading accounts, grants
│       │   ├── trades/         # Binary + Forex
│       │   ├── journal/        # Trading journal + AI
│       │   ├── goals/          # Goal tracking
│       │   ├── alerts/         # Price + signal alerts
│       │   ├── market-data/    # Candles, prices, calendar
│       │   ├── scanner/        # Harmonic + binary scanner
│       │   ├── backtest/
│       │   └── agent/          # Monster Cookies LLM
│       └── websockets/         # TradingGateway
├── frontend/                   # Flutter
│   └── lib/
│       ├── core/               # ApiClient, WsClient, AuthCubit
│       ├── features/           # login, dashboard, trades...
│       └── shared/             # Widgets, theme
├── infra/
│   ├── nginx/nginx.conf
│   └── postgres/init.sql       # TimescaleDB + schema
└── shared/                     # TypeScript DTOs
```

---

## Multi-User Architecture (CRITICAL)

- **Every table** has `user_id UUID FK → users.id`
- **JWT Guard** on ALL endpoints (except register/login)
- **WebSocket rooms**: `user:{userId}:trades`, `user:{userId}:alerts`
- **Roles**: admin (full access), trader (own data), viewer (read-only)
- **Rate limiting**: per-user throttler

---

## Implementation Plan (50 Tasks)

See `openspec/changes/jade-capital-v3-scaffold/tasks.md`

### Phase 1 — Foundation
1. **Infrastructure** (T001–T008): Docker, init.sql, nginx
2. **Backend Core** (T009–T013): NestJS init, Config, DB, Redis
3. **Auth + Users** (T014–T019): JWT, guards, register/login
4. **Schema** (T020–T025): All entities + migration
5. **Module Skeletons** (T026–T032): 8 feature modules
6. **WebSocket** (T033–T035): Gateway + auth + rooms
7. **Shared Types** (T036): DTOs package
8. **Flutter Core** (T037–T044): Init, API client, login page
9. **Integration** (T045–T050): Smoke tests

---

## Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Monolith vs Microservices | Monolith | Same logical separation, less ops overhead |
| State Management | Riverpod 2.x | Simpler than BLoC for MVP |
| ORM | TypeORM | Best NestJS integration |
| Job Queue | Bull + Redis | Mature, built-in retries |
| Testing | strict_tdd: false | Enable after scaffold |
| Charts | TradingView WebView | Pro widget, zero rebuild |

---

## Coming Back

When you return, the SDD artifacts are at:
- `openspec/changes/jade-capital-v3-scaffold/proposal.md`
- `openspec/changes/jade-capital-v3-scaffold/exploration.md`
- `openspec/changes/jade-capital-v3-scaffold/tasks.md`

Start with: `sdd-apply` → begin implementing tasks from Phase 1.
