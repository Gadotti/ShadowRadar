'use strict';

const ALLOWED_FIELDS = new Set(['status', 'finished_at', 'assets_scanned', 'cves_found', 'error_message']);

function createRun(db, { started_at }) {
  const result = db.prepare(`
    INSERT INTO scan_runs (started_at, status, assets_scanned, cves_found)
    VALUES (?, 'running', 0, 0)
  `).run(started_at);
  return result.lastInsertRowid;
}

function updateRun(db, id, updates) {
  const fields = Object.entries(updates).filter(([k, v]) => ALLOWED_FIELDS.has(k) && v !== undefined);
  if (!fields.length) return;
  const sql = `UPDATE scan_runs SET ${fields.map(([k]) => `${k}=?`).join(', ')} WHERE id=?`;
  db.prepare(sql).run(...fields.map(([, v]) => v), id);
}

function getRunById(db, id) {
  return db.prepare('SELECT * FROM scan_runs WHERE id=?').get(id);
}

function getCurrentRun(db) {
  return db.prepare("SELECT * FROM scan_runs WHERE status='running' ORDER BY id DESC LIMIT 1").get();
}

function listRuns(db, limit = 20) {
  return db.prepare('SELECT * FROM scan_runs ORDER BY started_at DESC LIMIT ?').all(limit);
}

function getLastCompletedRun(db) {
  return db.prepare("SELECT * FROM scan_runs WHERE status='completed' ORDER BY started_at DESC LIMIT 1").get();
}

module.exports = { createRun, updateRun, getRunById, getCurrentRun, listRuns, getLastCompletedRun };
