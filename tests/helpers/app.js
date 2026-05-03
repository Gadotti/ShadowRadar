'use strict';

const os   = require('os');
const path = require('path');
const fs   = require('fs');

/**
 * Create a unique temp file path for each test run.
 * Each integration test file sets DB_PATH to this before requiring any project modules.
 */
function tempDbPath() {
  return path.join(os.tmpdir(), `sr-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

/**
 * Start the Express app on a random port using the DB already pointed to by DB_PATH.
 * Call AFTER getDb() + runMigrations() so the schema is ready.
 * Returns { server, port, baseUrl }.
 */
function startApp() {
  const { buildApp } = require('../../src/server');
  const app = buildApp();
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      resolve({ server, port, baseUrl: `http://localhost:${port}` });
    });
  });
}

/** Gracefully close the HTTP server. */
function stopApp(server) {
  return new Promise((resolve) => server.close(resolve));
}

/** Clean up temp DB files (main + WAL shards). */
function cleanupDb(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch { /* ignore */ }
  }
}

/**
 * Minimal fetch wrapper for integration tests.
 * Returns { status, data, headers }.
 */
async function req(baseUrl, method, path, { body, cookie, apiKey } = {}) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  if (cookie)  opts.headers['Cookie']    = cookie;
  if (apiKey)  opts.headers['X-API-Key'] = apiKey;

  const res  = await fetch(`${baseUrl}${path}`, opts);
  const ct   = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : null;
  return { status: res.status, data, headers: res.headers };
}

/**
 * Login and return cookie string ready for use in `req`.
 * @param {string} baseUrl
 * @param {'editor'|'reader'} role
 */
async function loginAs(baseUrl, role = 'editor') {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: role, password: 'test123' }),
  });
  const raw = res.headers.get('set-cookie') || '';
  const match = raw.match(/token=([^;]+)/);
  return match ? `token=${match[1]}` : '';
}

module.exports = { tempDbPath, startApp, stopApp, cleanupDb, req, loginAs };
