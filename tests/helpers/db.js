'use strict';

const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const { runMigrations } = require('../../src/db/migrate');

/** Create a fresh in-memory SQLite DB with schema applied. */
function makeDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

/**
 * Seed a standard editor + reader user into `db`.
 * Uses 4 bcrypt rounds for test speed.
 */
async function seedUsers(db) {
  const hash = await bcrypt.hash('test123', 4);
  db.prepare('INSERT INTO users (name, username, password_hash, role) VALUES (?,?,?,?)').run('Editor User', 'editor', hash, 'editor');
  db.prepare('INSERT INTO users (name, username, password_hash, role) VALUES (?,?,?,?)').run('Reader User', 'reader', hash, 'reader');
}

/** Insert a minimal active asset. Returns the inserted id. */
function seedAsset(db, overrides = {}) {
  const data = {
    name: 'TestApp', tag: '#srv', url: 'https://test.com',
    current_version: '1.0.0', cve_start_date: '2024-01-01', active: 1,
    ...overrides,
  };
  return db.prepare(
    'INSERT INTO assets (name, tag, url, current_version, cve_start_date, active) VALUES (?,?,?,?,?,?)'
  ).run(data.name, data.tag, data.url, data.current_version, data.cve_start_date, data.active).lastInsertRowid;
}

/** Insert a minimal CVE record. Returns the inserted id. */
function seedCve(db, assetId, overrides = {}) {
  const data = {
    cve_id: 'CVE-2024-0001', description: 'Test vuln', severity: 'HIGH',
    cvss_score: 7.5, published_at: '2024-03-01', scanned_at: '2026-01-01T00:00:00Z',
    user_assessment: null, ai_assessment: null,
    ...overrides,
  };
  return db.prepare(
    'INSERT INTO asset_cves (asset_id, cve_id, description, severity, cvss_score, published_at, scanned_at, user_assessment, ai_assessment) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(assetId, data.cve_id, data.description, data.severity, data.cvss_score,
    data.published_at, data.scanned_at, data.user_assessment, data.ai_assessment).lastInsertRowid;
}

/** Seed default config entries. */
function seedConfig(db) {
  const entries = [
    ['nist.page_size', '50'], ['nist.api_key', ''],
    ['ai.enabled', 'false'], ['ai.api_url', 'https://api.anthropic.com'],
    ['ai.api_key_env', ''], ['ai.model', 'claude-sonnet-4-6'],
    ['ai.max_tokens', '16000'], ['ai.temperature', '0'],
    ['ai.batch_size', '20'], ['scan.script_path', './scripts/scan.py'],
  ];
  const stmt = db.prepare("INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)");
  entries.forEach(([k, v]) => stmt.run(k, v));
}

module.exports = { makeDb, seedUsers, seedAsset, seedCve, seedConfig };
