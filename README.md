# ShadowRadar

**External Security Posture Management (ESPM)** — CVE monitoring for external assets.

ShadowRadar tracks your external infrastructure (web apps, firewalls, SaaS services, third-party APIs) against the [NIST NVD](https://nvd.nist.gov/) CVE database and optionally enriches each finding with an AI-powered risk assessment via the Claude API. Results are stored locally in SQLite and surfaced through a clean web dashboard.

---

## Screenshots

**Dashboard** — KPI summary, severity distribution, CVEs per asset, monthly trend, and assessment breakdown.

![Dashboard](imgs/dashboard.PNG)

**Assets** — Full asset inventory with version tracking, scan status, and CVE count per asset.

![Assets](imgs/assets.PNG)

**CVE Results** — Filterable CVE list with severity badges, CVSS scores, AI assessment column, and per-CVE detail panel.

![CVE Results](imgs/cves-list.PNG)

---

## Requirements

| Dependency | Version |
|---|---|
| Node.js | 20+ |

No database server is needed — ShadowRadar uses an embedded SQLite file.

Optional: a [NIST NVD API key](https://nvd.nist.gov/developers/request-an-api-key) (increases rate limits from 5 to 50 requests/30 s) and an [Anthropic API key](https://console.anthropic.com/) for AI-assisted CVE assessments.

> **Scan script:** CVE scanning requires an external script. See [CVE Scan Script](#cve-scan-script) below.

---

## Quick Start

### Option A — Docker (recommended)

```bash
# 1. Create a docker-compose.yml with the snippet from the Docker section below
#    and fill in JWT_SECRET

# 2. Pull and start
docker compose pull
docker compose up -d

# 3. Create your first user
docker exec -it shadowradar node scripts/create-user.js
```

Open [http://localhost:3500](http://localhost:3500) in your browser. See the [Docker](#docker) section for the full `docker-compose.yml` and all configuration options.

### Option B — Local (Node.js)

```bash
# 1. Clone and install Node dependencies
git clone https://github.com/Gadotti/ShadowRadar
cd shadowradar
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set a strong JWT_SECRET (≥32 random chars)

# 3. Create the database and seed development users
npm run db:migrate
npm run db:seed        # creates admin/admin123 and viewer/viewer123

# 4. Start the server
npm start            # production
```

Open [http://localhost:3500](http://localhost:3500) in your browser.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3500` | HTTP port |
| `NODE_ENV` | `development` | `development` or `production` |
| `DB_PATH` | `./data/shadowradar.db` | Path to the SQLite database file |
| `JWT_SECRET` | — | **Required.** Random string ≥ 32 characters |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `ENCRYPTION_KEY` | — | 64-character hex string (AES-256-GCM key). Required only when using the **Direct key** mode in AI config. Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

### CVE Scan Script

CVE scanning is handled by an **external script** — not bundled in this repository. The project [check-cve-assets](https://github.com/Gadotti/check-cve-assets) is being adapted to integrate with ShadowRadar as its scan engine.

Once integrated, scans will be triggerable directly from the **Run Scan** page in the UI, which will spawn the external script as a child process pointed at the ShadowRadar SQLite database.

---

## Authentication

ShadowRadar uses two independent authentication mechanisms:

### Session (browser SPA)

Login at `/#/login` with a username and password. A signed **JWT is stored in an `httpOnly`, `SameSite=Strict` cookie** (30-day expiry). The login endpoint is rate-limited to **10 attempts per 15 minutes per IP**.

### API Keys (external integrations)

Editors can generate API keys from the **API Keys** page. Keys are stored hashed in the database and passed via the `X-API-Key` request header. They grant access to the machine-to-machine endpoints:

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/export` | GET | Full security report (assets + CVEs + risk level) |
| `/api/v1/assets/sync` | POST | Upsert assets from an external system |

### Roles

| Role | Permissions |
|---|---|
| `reader` | Read-only access to all pages and data |
| `editor` | Full CRUD, scan execution, config changes, API key management |

The seed command creates one account of each role (`admin` / `viewer`). New users can be created interactively:

```bash
npm run create-user
```

---

## Features

- **Asset inventory** — Register external assets with name, tag, URL, version, and a CVE scan start date. Assets can be activated or deactivated individually.
- **CVE scanning** — An external scan script (see [check-cve-assets](https://github.com/Gadotti/check-cve-assets)) queries the NIST NVD API for CVEs matching each asset's software name and version. Results are stored with severity, CVSS score, and publication date.
- **AI assessment** — When an Anthropic API key is configured and AI is enabled, the scan script sends each new CVE to Claude for an automated risk assessment. CVEs that already have an AI assessment are never reprocessed (cost optimisation).
- **Dashboard** — At-a-glance KPIs (monitored assets, total CVEs, unassessed findings, items in mitigation) and four charts: severity distribution, CVEs per asset (top 10), monthly trend, and assessment distribution. All charts support filtering by asset, time period, and severity.
- **CVE results view** — Sortable and filterable table with full-text search, severity chips, AI badge, per-row assessment editor, and an expandable detail panel. Toggle between list and macro (card) view.
- **NIST config** — Set your NVD API key and page size from the UI.
- **AI config** — Enable/disable AI enrichment, configure the Anthropic API key (either via environment variable name or stored directly in the database encrypted with AES-256-GCM using `ENCRYPTION_KEY`), and choose the Claude model.
- **API documentation** — Interactive Swagger UI at `/api/docs` (public, no login required). OpenAPI 3.0 spec available as JSON at `/api/docs/spec`.
- **External sync** — Push asset lists from CI/CD pipelines or asset management tools via `POST /api/v1/assets/sync` (API key required). The `cve_start_date` field is never overwritten once set.
- **Security export** — Pull a full JSON security report with computed risk levels via `GET /api/v1/export`.

---

## Testing

ShadowRadar uses **Jest** with an in-memory SQLite database for isolated, repeatable tests.

```bash
# Run all tests
npm test

# Run a single test file
node --experimental-vm-modules node_modules/jest/bin/jest.js tests/unit/services/authService.test.js
```

### Test helpers

Located in `tests/helpers/`:

| Helper | Purpose |
|---|---|
| `makeDb()` | Spins up an in-memory SQLite DB with all migrations applied |
| `seedUsers()` | Inserts an admin and a viewer account |
| `seedAsset()` | Inserts a test asset |
| `seedCve()` | Inserts a test CVE result |
| `seedConfig()` | Inserts NIST / AI configuration entries |
| `buildTestApp(db)` | Mounts the full Express app against the in-memory DB for HTTP integration tests |

### Test layout

```
tests/
  helpers/      # Shared DB and app factory helpers
  unit/         # Per-module tests (services, repositories, middleware)
  integration/  # Full HTTP round-trip tests via supertest
```

Unit tests instantiate services and repositories directly. Integration tests make real HTTP requests through the Express app, exercising the full middleware stack including authentication and validation.

---

## Architecture

```
Frontend (Vanilla JS / ES Modules, hash-based routing)
    └── HTTP/REST + fetch
Backend (Node.js + Express)
    ├── SQLite via better-sqlite3 (WAL mode)
    └── child_process.spawn → check-cve-assets (external, coming soon)
                                ├── NIST NVD API
                                └── Claude API (optional)
```

No build step — the frontend is plain HTML/CSS/ES modules served statically by Express. Chart.js is bundled locally under `public/vendor/`.

### Key directories

```
src/
  api/           # Express route handlers (thin controllers)
  services/      # Business logic
  repositories/  # SQLite queries
  integrations/  # NIST and Claude API clients
  middleware/    # Auth, validation, error handler
  db/            # Migration runner and connection singleton
public/
  js/
    app.js       # Hash-router entry point
    api.js       # Centralised fetch wrapper
    pages/       # One module per page
    components/  # Reusable UI pieces (sidebar, custom-select)
  css/           # Tokenised stylesheet split by concern
scripts/
  # CVE scan script — provided by check-cve-assets (external repo, integration pending)
```

---

## Docker

ShadowRadar is published as a container image on the [GitHub Container Registry](https://github.com/Gadotti/shadowradar/pkgs/container/shadowradar). The image bundles Node.js and Python 3 in a single runtime — no separate containers needed.

### Requirements

- Docker 24+
- Docker Compose v2

### Running with Docker Compose

Copy the snippet below into a `docker-compose.yml` on your server, fill in the required values, and start the stack:

```yaml
services:
  shadowradar:
    image: ghcr.io/gadotti/shadowradar:latest
    restart: unless-stopped
    ports:
      - "3500:3500"
    volumes:
      - shadowradar_data:/app/data
    environment:
      - NODE_ENV=production
      - PORT=3500
      - DB_PATH=/app/data/shadowradar.db
      - JWT_SECRET=TROQUE_POR_STRING_ALEATORIA_DE_ALTA_ENTROPIA
      - LOG_LEVEL=info
      # Required only when using Direct key mode in AI config
      # - ENCRYPTION_KEY=TROQUE_POR_STRING_HEX_64_CHARS

volumes:
  shadowradar_data:
    name: shadowradar_data
```

```bash
docker compose pull
docker compose up -d
```

The application will be available at `http://localhost:3500`. Database migrations run automatically on startup.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | Yes | Random string ≥ 32 characters. Generate with: `openssl rand -base64 32` |
| `DB_PATH` | Yes | Must be `/app/data/shadowradar.db` when using the volume as configured above |
| `PORT` | No | Defaults to `3500` |
| `NODE_ENV` | No | Set to `production` in container deployments |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, or `error`. Defaults to `info` |
| `ENCRYPTION_KEY` | No | 64-character hex string. Required only when storing the AI API key directly in the database. Generate with: `openssl rand -hex 32` |

### First-time setup

After the container is running, create your first user:

```bash
docker exec -it shadowradar node scripts/create-user.js
```

### Persistent data

The SQLite database is stored in a named Docker volume (`shadowradar_data`), mapped to `/app/data` inside the container. The volume survives container restarts and image updates — `docker compose pull && docker compose up -d` updates the app without touching the data.

### CVE scan

The scan script runs inside the container. Trigger it manually or via a host cron job using `docker exec`:

```bash
# Manual trigger
docker exec shadowradar python /app/scripts/scan.py --db /app/data/shadowradar.db

# Host crontab — run every 6 hours
0 */6 * * * docker exec shadowradar python /app/scripts/scan.py --db /app/data/shadowradar.db
```

### Backup

Back up the database volume to a compressed archive in the current directory:

```bash
docker run --rm \
  -v shadowradar_data:/data \
  -v $(pwd):/backup \
  busybox \
  tar czf /backup/shadowradar_backup_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .
```

To restore from a backup:

```bash
docker run --rm \
  -v shadowradar_data:/data \
  -v $(pwd):/backup \
  busybox \
  tar xzf /backup/shadowradar_backup_20260603_143000.tar.gz -C /data
```

---

## License

This project is unlicensed. Use at your own discretion.
