'use strict';

const name = '001_initial_schema';

function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      username      TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'reader' CHECK(role IN ('reader', 'editor')),
      created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS assets (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    NOT NULL,
      tag             TEXT,
      description     TEXT,
      url             TEXT,
      current_version TEXT    NOT NULL,
      cve_start_date  TEXT    NOT NULL,
      active          INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
      created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    -- Partial unique index: only enforces uniqueness when tag is not NULL.
    -- Assets with tag = NULL are unconstrained and may share the same name.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_name_tag
      ON assets(name, tag) WHERE tag IS NOT NULL;

    CREATE TABLE IF NOT EXISTS asset_cves (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id        INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      cve_id          TEXT    NOT NULL,
      description     TEXT,
      severity        TEXT    NOT NULL DEFAULT 'NONE'
                        CHECK(severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE')),
      cvss_score      REAL    NOT NULL DEFAULT 0.0,
      published_at    TEXT,
      user_assessment TEXT
                        CHECK(user_assessment IN (
                          'Acknowledge/Mitigating',
                          'Accepted Risk',
                          'Not Affected',
                          'False Positive'
                        )),
      user_notes      TEXT,
      ai_assessment   TEXT,
      scanned_at      TEXT,
      evaluated_at    TEXT,
      UNIQUE(asset_id, cve_id)
    );

    CREATE TABLE IF NOT EXISTS scan_runs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at     TEXT    NOT NULL,
      finished_at    TEXT,
      status         TEXT    NOT NULL DEFAULT 'running'
                       CHECK(status IN ('running', 'completed', 'failed')),
      assets_scanned INTEGER NOT NULL DEFAULT 0,
      cves_found     INTEGER NOT NULL DEFAULT 0,
      error_message  TEXT
    );

    CREATE TABLE IF NOT EXISTS config (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
  `);
}

module.exports = { name, up };
