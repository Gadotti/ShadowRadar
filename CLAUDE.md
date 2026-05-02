# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ShadowRadar** is an External Security Posture Management (ESPM) web application. It monitors external assets (web apps, SaaS, third-party APIs) by querying the NIST NVD CVE database and optionally enriching results via Claude AI. The CVE scan runs as an external Python script (`scripts/scan.py`) that reads config from and writes results to the SQLite database.

**Status:** Specification complete; implementation in progress per `.claude/tasks/`.

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
npm test                      # Run tests via node --test
```

Python scan script (requires `pip install requests>=2.31`):
```bash
python scripts/scan.py --db ./data/shadowradar.db             # Scan all active assets
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
  repositories/  # SQLite queries (receive `db` as parameter)
  integrations/  # External clients (NIST, Claude)
  middleware/    # Auth, validation, error handler
  models/        # Data shapes and Joi schemas
  db/
    connection.js          # Singleton db, WAL pragmas applied on open
    migrate.js             # Migration runner (auto-runs on server start)
    migrations/            # Numbered migration files
public/
  js/
    app.js       # Hash-router entry point
    api.js       # Centralised fetch wrapper
    pages/       # One module per page
    components/  # Reusable UI pieces
scripts/
  scan.py        # External CVE scan script (Python 3)
  create-user.js # CLI user creation
data/            # SQLite file (git-ignored)
tests/           # node --test unit tests
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

JWT (HS256) stored in `httpOnly; SameSite=Strict` cookie. Token payload: `{ userId, username, role }`. No database lookup per request. 30-day expiry. Rate-limited login: 10 attempts / 15 min / IP.

**Roles:** `reader` = GET only. `editor` = full CRUD + scan trigger + config writes.

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

### Code style

- Functions: 4-20 lines. Split if longer.
- Files: under 500 lines. Split by responsibility.
- One thing per function, one responsibility per module (SRP).
- Names: specific and unique. Avoid `data`, `handler`, `Manager`.
  Prefer names that return <5 grep hits in the codebase.
- Types: explicit. No `any`, no `Dict`, no untyped functions.
- No code duplication. Extract shared logic into a function/module.
- Early returns over nested ifs. Max 3 levels of indentation.
- Exception messages must include the offending value and expected shape.

### Comments

- Keep your own comments. Don't strip them on refactor — they carry
  intent and provenance.
- Write WHY, not WHAT. Skip `// increment counter` above `i++`.
- Docstrings on public functions: intent + one usage example.
- Reference issue numbers / commit SHAs when a line exists because
  of a specific bug or upstream constraint.

### Tests

- Tests run with a single command: `<project-specific>`.
- Every new function gets a test. Bug fixes get a regression test.
- Mock external I/O (API, DB, filesystem) with named fake classes,
  not inline stubs.
- Tests must be F.I.R.S.T: fast, independent, repeatable,
  self-validating, timely.

### Dependencies

- Inject dependencies through constructor/parameter, not global/import.
- Wrap third-party libs behind a thin interface owned by this project.

### Structure

- Follow the framework's convention (Node.js).
- Prefer small focused modules over god files.
- Predictable paths: controller/model/view, src/lib/test, etc.

### Logging

- Structured JSON when logging for debugging / observability.
- Plain text only for user-facing CLI output.

---

## Key Constraints

- **SQLite WAL mode** must remain active — `scan.py` writes to the DB while the Node.js server is running. Never change `journal_mode`.
- **No bundler / no build step.** Frontend must work as plain ES modules in the browser.
- **CVEs already carrying `ai_assessment` are never reprocessed** by the AI — cost optimisation baked into `scan.py`.
- Passwords: bcrypt ≥12 rounds. All SQL: prepared statements only (no string interpolation). API keys stored hashed.
- The spec is authoritative: `.claude/SPEC-IA.MD` is the full system specification. `.claude/tasks/` contains sequential implementation tasks.
