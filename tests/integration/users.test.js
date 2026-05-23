'use strict';

const os   = require('os');
const path = require('path');

process.env.JWT_SECRET = 'test-jwt-secret-minimum-32-chars-xxxx';
process.env.DB_PATH    = path.join(os.tmpdir(), `sr-int-users-${Date.now()}.db`);

const { getDb }         = require('../../src/db/connection');
const { runMigrations } = require('../../src/db/migrate');
const { seedUsers }     = require('../helpers/db');
const { startApp, stopApp, cleanupDb, req, loginAs } = require('../helpers/app');

describe('user routes', () => {
  let server, baseUrl, editorCookie, readerCookie, editorId, readerId;

  beforeAll(async () => {
    const db = getDb();
    runMigrations(db);
    await seedUsers(db);

    const editor = db.prepare('SELECT id FROM users WHERE username = ?').get('editor');
    const reader = db.prepare('SELECT id FROM users WHERE username = ?').get('reader');
    editorId = editor.id;
    readerId = reader.id;

    const info   = await startApp();
    server       = info.server;
    baseUrl      = info.baseUrl;
    editorCookie = await loginAs(baseUrl, 'editor');
    readerCookie = await loginAs(baseUrl, 'reader');
  });

  afterAll(async () => {
    await stopApp(server);
    cleanupDb(process.env.DB_PATH);
  });

  describe('GET /api/users', () => {
    test('authenticated user receives list with expected shape', async () => {
      const r = await req(baseUrl, 'GET', '/api/users', { cookie: editorCookie });
      expect(r.status).toBe(200);
      expect(Array.isArray(r.data.users)).toBe(true);
      const u = r.data.users[0];
      expect(u).toHaveProperty('id');
      expect(u).toHaveProperty('name');
      expect(u).toHaveProperty('username');
      expect(u).toHaveProperty('role');
      expect(u).toHaveProperty('created_at');
      expect(u).not.toHaveProperty('password_hash');
    });

    test('reader can also list users', async () => {
      const r = await req(baseUrl, 'GET', '/api/users', { cookie: readerCookie });
      expect(r.status).toBe(200);
      expect(Array.isArray(r.data.users)).toBe(true);
    });

    test('returns both seeded users', async () => {
      const r = await req(baseUrl, 'GET', '/api/users', { cookie: editorCookie });
      expect(r.data.users.length).toBeGreaterThanOrEqual(2);
    });

    test('returns 401 without authentication', async () => {
      const r = await req(baseUrl, 'GET', '/api/users');
      expect(r.status).toBe(401);
    });
  });

  describe('DELETE /api/users/:id', () => {
    test('editor can delete another user and receives 204', async () => {
      const db = getDb();
      const hash = require('bcrypt').hashSync('temp123', 4);
      const { lastInsertRowid } = db.prepare(
        'INSERT INTO users (name, username, password_hash, role) VALUES (?,?,?,?)'
      ).run('Temp User', 'tempuser', hash, 'reader');

      const r = await req(baseUrl, 'DELETE', `/api/users/${lastInsertRowid}`, { cookie: editorCookie });
      expect(r.status).toBe(204);

      const check = await req(baseUrl, 'GET', '/api/users', { cookie: editorCookie });
      expect(check.data.users.find(u => u.id === lastInsertRowid)).toBeUndefined();
    });

    test('reader is blocked with 403', async () => {
      const r = await req(baseUrl, 'DELETE', `/api/users/${editorId}`, { cookie: readerCookie });
      expect(r.status).toBe(403);
    });

    test('editor cannot delete their own account', async () => {
      const r = await req(baseUrl, 'DELETE', `/api/users/${editorId}`, { cookie: editorCookie });
      expect(r.status).toBe(400);
      expect(r.data.error).toMatch(/own account/i);
    });

    test('returns 404 for unknown user id', async () => {
      const r = await req(baseUrl, 'DELETE', '/api/users/99999', { cookie: editorCookie });
      expect(r.status).toBe(404);
    });

    test('returns 400 for non-numeric id', async () => {
      const r = await req(baseUrl, 'DELETE', '/api/users/abc', { cookie: editorCookie });
      expect(r.status).toBe(400);
    });

    test('returns 401 without authentication', async () => {
      const r = await req(baseUrl, 'DELETE', `/api/users/${readerId}`);
      expect(r.status).toBe(401);
    });
  });
});
