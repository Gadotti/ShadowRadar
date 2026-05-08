# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ShadowRadar** is an External Security Posture Management (ESPM) web application. It monitors external assets (web apps, SaaS, third-party APIs) by querying the NIST NVD CVE database and optionally enriching results via Claude AI. The CVE scan runs as an external Python script (`scripts/scan.py`) that reads config from and writes results to the SQLite database.

---

## Commands

```bash
npm install                   # Install dependencies
cp .env.example .env          # First-time setup
npm run db:migrate            # Create/update database schema (idempotent)
npm run db:seed               # Insert dev fixtures (admin/admin123, viewer/viewer123)
npm run create-user           # Interactive CLI to create a user
npm run dev                   # Start server with --watch auto-reload
npm start                     # Production start
npm test                      # Run all tests (node --test)
node --test tests/unit/services/authService.test.js   # Run a single test file
```

Python scan script (requires `pip install requests>=2.31`):
```bash
python scripts/scan.py --db ./data/shadowradar.db              # Scan all active assets
python scripts/scan.py --db ./data/shadowradar.db --asset-id 42  # Scan one asset
```

---

## Architecture

```
Frontend (Vanilla JS / ES Modules, hash-based routing)
    └── HTTP/REST + fetch
Backend (Node.js + Express)
    ├── SQLite via better-sqlite3 (WAL mode)
    └── child_process.spawn → scripts/scan.py (Python)
                                ├── NIST NVD API
                                └── Claude API (optional)
```

**No build step.** The frontend is plain HTML/CSS/ES Modules served statically by Express. Chart.js is included locally under `public/vendor/`. No bundler, no transpilation.

### Directory layout

```
src/
  api/           # Express route handlers (thin controllers)
  services/      # Business logic
  repositories/  # SQLite queries (receive `db` as constructor parameter)
  integrations/  # External clients (NIST, Claude)
  middleware/    # Auth, validation, error handler
  models/        # Data shapes and Joi schemas
  db/
    connection.js          # Singleton db, WAL pragmas applied on open
    migrate.js             # Migration runner (auto-runs on server start)
    migrations/            # Numbered migration files
public/
  js/
    app.js       # Hash-router entry point — maps hash routes to page modules
    api.js       # Centralised fetch wrapper (redirects to #/login on 401)
    pages/       # One module per page, each exports render(el, user)
    components/  # Reusable UI pieces (sidebar, custom-select)
  css/
    base.css       # Tokens (:root), reset, typography, utilities
    layout.css     # #sidebar, #content, sidebar component
    components.css # Buttons, forms, tables, cards, badges, modal, loading, toasts
    login.css      # Login page
    config.css     # configNist, configAi, scan, settings pages
    results.css    # Results page (chips, filter, detail panel)
    dashboard.css  # KPI grid and charts
scripts/
  scan.py        # External CVE scan script (Python 3)
  create-user.js # CLI user creation
data/            # SQLite file (git-ignored)
tests/
  helpers/       # makeDb(), seedUsers(), seedAsset(), seedCve(), seedConfig()
  unit/          # Per-module tests (services, repositories, middleware)
  integration/   # Full HTTP tests using buildApp() + in-memory DB
```

### Data model (5 tables)

| Table | Key columns |
|---|---|
| `users` | id, username (UNIQUE), password_hash, role ('reader'\|'editor') |
| `assets` | id, name, tag (NULL), url, current_version, active, cve_start_date; UNIQUE(name, tag) when tag is not NULL |
| `asset_cves` | id, asset_id (FK CASCADE DELETE), cve_id, severity, cvss_score, user_assessment, ai_assessment |
| `scan_runs` | id, started_at, finished_at, status ('running'\|'completed'\|'failed') |
| `config` | key (PK), value — keys: `nist.page_size`, `nist.api_key`, `ai.enabled`, `ai.api_key`, `ai.model`, `scan.script_path` |

### Authentication

Two mechanisms, used in different contexts:

- **JWT cookie** — `httpOnly; SameSite=Strict`, token payload `{ userId, username, role }`, 30-day expiry. Used by the browser SPA. Rate-limited login: 10 attempts / 15 min / IP.
- **X-API-Key header** — hashed API keys stored in DB. Used by external integrations (`/api/v1/export`, `/api/v1/assets/sync`). These routes accept either mechanism via `authAny`.

**Roles:** `reader` = GET only. `editor` = full CRUD + scan trigger + config writes. `EDITOR_ROUTES` in `app.js` enforces this on the frontend; `authorize` middleware enforces it on the backend.

### External integration endpoints

- `GET /api/v1/export` — returns a JSON security report (all assets + CVEs, risk level computed). Accepts JWT cookie or `X-API-Key`.
- `POST /api/v1/assets/sync` — upserts an array of assets from an external system. Accepts `X-API-Key` only. Never overwrites `cve_start_date` if already set in the DB.

### Environment variables

```
PORT=3500
NODE_ENV=development
DB_PATH=./data/shadowradar.db
JWT_SECRET=<random ≥32 chars>
LOG_LEVEL=info
```

---

## Code Standards

### Style

- Functions: 4–20 lines. Files: under 500 lines. Split by responsibility.
- Names: specific and unique. Avoid `data`, `handler`, `Manager`. Prefer names that return <5 grep hits.
- Early returns over nested ifs.
- Exception messages must include the offending value and expected shape.
- No code duplication. Extract shared logic into a function/module.

### Tests

- Tests are using Jest.
- `tests/helpers/db.js` provides `makeDb()` (in-memory SQLite with migrations), `seedUsers()`, `seedAsset()`, `seedCve()`, `seedConfig()`.
- `tests/helpers/app.js` provides `buildTestApp(db)` for integration tests — spins up `buildApp()` wired to an in-memory DB.
- Unit tests instantiate services/repositories directly with a `makeDb()` instance.
- Integration tests make real HTTP requests through the Express app.

### Test-after-change workflow

After every code change, run `npm test` and inspect the output. If any test fails:
1. Read the failure message and identify the root cause.
2. Fix the code. If the code it's not the problem, fix the test itself if necessary (never disable or delete the failing test).
3. Run `npm test` again.
4. Repeat until all tests pass before considering the task done.

---

## Frontend UI Patterns

### Combobox / Select

**Never use native `<select>` elements.** All dropdowns must use the custom combobox component from `public/js/components/custom-select.js`.

**Usage:**
1. Place an empty `<div class="custom-select-wrapper" id="my-select"></div>` in the HTML template.
2. Call `initCustomSelect(el, config)` after the HTML is injected into the DOM.

```js
import { initCustomSelect } from '../components/custom-select.js';

// Single select
const ctrl = initCustomSelect(container.querySelector('#my-select'), {
  options:  [{ value: 'a', label: 'Option A' }, ...],
  value:    'a',            // initial selected value
  onChange: v => { ... },   // called on every selection
});

// Multi-select
const ctrl = initCustomSelect(container.querySelector('#my-select'), {
  options:     [...],
  multiple:    true,
  values:      [],                   // initial selections
  placeholder: 'Todos os itens',     // shown when nothing selected
  onChange:    vs => { ... },        // called with string[]
});
```

**Controller API:** `getValue()`, `setValue(v)`, `getValues()`, `setValues(vs)`, `setOptions(opts)`, `reset()`, `destroy()`.

- Call `reset()` when clearing filters.
- Call `destroy()` when removing a modal that contains a select (prevents listener leak).
- Styles live in `public/css/components.css` under `/* ===== CUSTOM SELECT ===== */`.

---

## Key Constraints

- **SQLite WAL mode** must remain active — `scan.py` writes to the DB while the Node.js server is running. Never change `journal_mode`.
- **No bundler / no build step.** Frontend must work as plain ES modules in the browser. All `<link>` tags in `index.html` are loaded in order; `base.css` must come first (defines CSS tokens used by all other sheets).
- **CVEs already carrying `ai_assessment` are never reprocessed** by the AI — cost optimisation baked into `scan.py`.
- Passwords: bcrypt ≥12 rounds. All SQL: prepared statements only (no string interpolation). API keys stored hashed.
