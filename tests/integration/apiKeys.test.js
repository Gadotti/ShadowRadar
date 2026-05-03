'use strict';

const os   = require('os');
const path = require('path');

process.env.JWT_SECRET = 'test-jwt-secret-minimum-32-chars-xxxx';
process.env.DB_PATH    = path.join(os.tmpdir(), `sr-int-apikeys-${Date.now()}.db`);

const { getDb }         = require('../../src/db/connection');
const { runMigrations } = require('../../src/db/migrate');
const { seedUsers }     = require('../helpers/db');
const { startApp, stopApp, cleanupDb, req, loginAs } = require('../helpers/app');

describe('api key routes', () => {
  let server, baseUrl, editorCookie, readerCookie;

  beforeAll(async () => {
    const db = getDb();
    runMigrations(db);
    await seedUsers(db);
    const info = await startApp();
    server       = info.server;
    baseUrl      = info.baseUrl;
    editorCookie = await loginAs(baseUrl, 'editor');
    readerCookie = await loginAs(baseUrl, 'reader');
  });

  afterAll(async () => {
    await stopApp(server);
    cleanupDb(process.env.DB_PATH);
  });

  describe('GET /api/settings/api-keys', () => {
    test('editor can list api keys', async () => {
      const r = await req(baseUrl, 'GET', '/api/settings/api-keys', { cookie: editorCookie });
      expect(r.status).toBe(200);
      expect(Array.isArray(r.data)).toBe(true);
    });

    test('list does not expose key_hash', async () => {
      await req(baseUrl, 'POST', '/api/settings/api-keys', {
        cookie: editorCookie,
        body: { name: 'ForList' },
      });
      const r = await req(baseUrl, 'GET', '/api/settings/api-keys', { cookie: editorCookie });
      expect(r.data.every(k => !('key_hash' in k))).toBe(true);
    });

    test('reader is blocked with 403', async () => {
      const r = await req(baseUrl, 'GET', '/api/settings/api-keys', { cookie: readerCookie });
      expect(r.status).toBe(403);
    });

    test('unauthenticated is blocked with 401', async () => {
      const r = await req(baseUrl, 'GET', '/api/settings/api-keys');
      expect(r.status).toBe(401);
    });
  });

  describe('POST /api/settings/api-keys', () => {
    test('editor creates a key and receives the plain key once', async () => {
      const r = await req(baseUrl, 'POST', '/api/settings/api-keys', {
        cookie: editorCookie,
        body: { name: 'IntegrationKey' },
      });
      expect(r.status).toBe(201);
      expect(r.data.key.startsWith('sr_')).toBe(true);
      expect(r.data.id).toBeGreaterThan(0);
      expect(r.data.warning).toBeTruthy();
      expect(r.data.name).toBe('IntegrationKey');
    });

    test('created key works for export authentication', async () => {
      const create = await req(baseUrl, 'POST', '/api/settings/api-keys', {
        cookie: editorCookie,
        body: { name: 'WorkingKey' },
      });
      const exportR = await req(baseUrl, 'GET', '/api/v1/export', { apiKey: create.data.key });
      expect(exportR.status).toBe(200);
    });

    test('returns 400 when name is empty', async () => {
      const r = await req(baseUrl, 'POST', '/api/settings/api-keys', {
        cookie: editorCookie,
        body: { name: '' },
      });
      expect(r.status).toBe(400);
    });

    test('reader is blocked with 403', async () => {
      const r = await req(baseUrl, 'POST', '/api/settings/api-keys', {
        cookie: readerCookie,
        body: { name: 'ReaderKey' },
      });
      expect(r.status).toBe(403);
    });
  });

  describe('DELETE /api/settings/api-keys/:id', () => {
    test('editor can delete an api key', async () => {
      const create = await req(baseUrl, 'POST', '/api/settings/api-keys', {
        cookie: editorCookie,
        body: { name: 'DeleteMe' },
      });
      const r = await req(baseUrl, 'DELETE', `/api/settings/api-keys/${create.data.id}`, {
        cookie: editorCookie,
      });
      expect(r.status).toBe(204);
    });

    test('deleted key no longer authenticates for export', async () => {
      const create = await req(baseUrl, 'POST', '/api/settings/api-keys', {
        cookie: editorCookie,
        body: { name: 'ToBeRevoked' },
      });
      const plainKey = create.data.key;
      await req(baseUrl, 'DELETE', `/api/settings/api-keys/${create.data.id}`, {
        cookie: editorCookie,
      });
      const exportR = await req(baseUrl, 'GET', '/api/v1/export', { apiKey: plainKey });
      expect(exportR.status).toBe(401);
    });

    test('reader is blocked with 403', async () => {
      const create = await req(baseUrl, 'POST', '/api/settings/api-keys', {
        cookie: editorCookie,
        body: { name: 'ReaderCannotDelete' },
      });
      const r = await req(baseUrl, 'DELETE', `/api/settings/api-keys/${create.data.id}`, {
        cookie: readerCookie,
      });
      expect(r.status).toBe(403);
    });
  });
});
