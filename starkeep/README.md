# Starkeep Academy — Codebase

> Read `docs/STARKEEP_CONTEXT.md` before touching any code.
> Read `docs/DECISIONS.md` before making any architectural choice.
> Read `docs/API_CONTRACT.md` before writing any API or frontend data call.

---

## Repo Structure

```
starkeep/
├── backend/              Django + DRF + Channels (starkeep-api)
│   ├── apps/
│   │   ├── common/       Base models, pagination, exceptions
│   │   ├── users/        Auth (custom User model + allauth)
│   │   ├── avatar/       Avatar, ArchetypeProfile, HeroicPath, LearningPath
│   │   ├── starmap/      Milestone, Star, Constellation, Evidence
│   │   ├── missions/     Mission (stubbed v1)
│   │   ├── academy/      Guild, Channel, Message (schema only v1)
│   │   └── lux/          Wallet, Transaction, LVM formula, signals
│   └── starkeep_project/ Settings, URLs, ASGI
│
├── starkeep_ai/          FastAPI AI microservice (starkeep-ai)
│   ├── providers/        base.py (Protocol), mock.py, openai.py (phase 5+)
│   └── routers/          FastAPI route handlers
│
├── frontend/             React Native + Expo Router (starkeep-app)
│   ├── app/              File-based routes
│   │   ├── (auth)/       Login, register, OAuth callback
│   │   └── (shell)/      Authenticated shell: avatar, star-maps, lux, academy, settings
│   ├── features/         One folder per backend app
│   │   ├── auth/         Auth store (Zustand), login/register hooks
│   │   ├── avatar/       Types, API calls, React Query hooks
│   │   ├── starmap/      Types, API calls, React Query hooks
│   │   ├── lux/          Types, API calls, React Query hooks
│   │   └── academy/      Types, API calls, React Query hooks
│   ├── design-system/    Tokens, component primitives, SVG icons
│   └── lib/              api-client, ws-client, token storage, platform utils
│
└── docs/
    ├── STARKEEP_CONTEXT.md   ← READ THIS FIRST. All domain knowledge.
    ├── DECISIONS.md          ← All locked architectural decisions.
    └── API_CONTRACT.md       ← Authoritative API shapes.
```

---

## Dependency Graph (DEC-009 — Enforced by import-linter)

```
common → users → avatar → {starmap, academy, missions} → lux
```

**Rule:** Cross-module communication via Django signals only.
If you find yourself importing from `lux` in `starmap`, you are doing it wrong.
Emit a `lux.signals.milestone_validated` signal instead.

---

## Quick Start

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill in your values
python manage.py migrate
python manage.py loaddata fixtures/heroic_paths.json fixtures/learning_paths.json
python manage.py createsuperuser
python manage.py runserver
```

### AI Microservice

```bash
cd starkeep_ai
pip install fastapi uvicorn httpx
AI_PROVIDER=mock uvicorn main:app --port 8001 --reload
```

### Frontend

```bash
cd frontend
npm install --legacy-peer-deps   # required for Expo SDK 54 + React 19 peer deps
npx expo start
```

---

## Key Rules

1. **Every feature folder mirrors a backend app.** `features/avatar/` ↔ `apps/avatar/`.
2. **Never import `lux` from another app.** Use Django signals.
3. **Never add API calls outside `features/*/index.ts`.** Use the typed functions there.
4. **Never rename VR-stable fields.** See `docs/STARKEEP_CONTEXT.md §8`.
5. **LVM formula lives in `apps/lux/scoring.py` and nowhere else.** It's a pure function.
6. **All design values come from `design-system/tokens.ts`.** No inline hex strings.
7. **Before any architectural decision, check `docs/DECISIONS.md`.**

---

## Phase Status

| Phase | Goal                                          | Status         |
| ----- | --------------------------------------------- | -------------- |
| 0     | Repos, CI/CD, design tokens, splash           | ✅ Complete    |
| 1     | Auth (email + Google + Apple, JWT)            | ✅ Complete    |
| 2     | Shell (radial nav, route stubs, home buttons) | ✅ Complete    |
| 3     | Star Map (read: milestones + constellations)  | 🔜 Next        |
| 4     | Star Map (write: create, edit, evidence)      | ⬜ Not started |
| 5     | Avatar (full Image 7 profile)                 | ⬜ Not started |
| 6     | LUX core (wallet, LVM formula, WS notify)     | ⬜ Not started |
| 7     | Academy + Mission Log                         | ⬜ Not started |
| 8     | Hardening (tests, Sentry, a11y)               | ⬜ Not started |

---

## Running Tests

```bash
# Backend (from /backend)
python manage.py test apps.lux.tests.test_scoring   # LVM formula — run this first
python manage.py test                                # full suite

# Dependency graph enforcement
lint-imports

# Frontend (from /frontend)
npx jest
```
