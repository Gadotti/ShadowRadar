'use strict';

function create(db, { name, keyHash }) {
  const result = db.prepare(`
    INSERT INTO api_keys (name, key_hash) VALUES (?, ?)
  `).run(name, keyHash);
  return result.lastInsertRowid;
}

function findByHash(db, keyHash) {
  return db.prepare('SELECT * FROM api_keys WHERE key_hash = ?').get(keyHash);
}

function listAll(db) {
  return db.prepare('SELECT id, name, created_at, last_used_at FROM api_keys ORDER BY id').all();
}

function updateLastUsed(db, id) {
  db.prepare(`UPDATE api_keys SET last_used_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`).run(id);
}

function remove(db, id) {
  db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
}

module.exports = { create, findByHash, listAll, updateLastUsed, remove };
