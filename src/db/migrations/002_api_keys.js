'use strict';

const name = '002_api_keys';

function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      key_hash     TEXT NOT NULL UNIQUE,
      created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      last_used_at TEXT
    )
  `);
}

module.exports = { name, up };
