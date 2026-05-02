'use strict';

function get(db, key) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : undefined;
}

function getAll(db) {
  const rows = db.prepare('SELECT key, value FROM config').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

function set(db, key, value) {
  db.prepare(`
    INSERT INTO config (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
  `).run(key, String(value));
}

function setMany(db, entries) {
  const stmt = db.prepare(`
    INSERT INTO config (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
  `);
  db.transaction(() => {
    for (const [key, value] of Object.entries(entries)) {
      stmt.run(key, String(value));
    }
  })();
}

module.exports = { get, getAll, set, setMany };
