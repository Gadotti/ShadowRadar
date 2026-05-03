'use strict';

const os   = require('os');
const path = require('path');

process.env.JWT_SECRET = 'test-jwt-secret-minimum-32-chars-xxxx';
process.env.DB_PATH    = path.join(os.tmpdir(), `sr-int-assets-${Date.now()}.db`);

const { getDb }         = require('../../src/db/connection');
const { runMigrations } = require('../../src/db/migrate');
const { seedUsers }     = require('../helpers/db');
const { startApp, stopApp, cleanupDb, req, loginAs } = require('../helpers/app');

describe('asset routes', () => {
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

  describe('GET /api/assets', () => {
    test('reader can list assets and receives paginated structure', async () => {
      const r = await req(baseUrl, 'GET', '/api/assets', { cookie: readerCookie });
      expect(r.status).toBe(200);
      expect('items' in r.data).toBe(true);
      expect('total' in r.data).toBe(true);
      expect('page' in r.data).toBe(true);
    });

    test('returns 401 without authentication', async () => {
      const r = await req(baseUrl, 'GET', '/api/assets');
      expect(r.status).toBe(401);
    });
  });

  describe('POST /api/assets', () => {
    test('editor can create asset and receives 201 with enriched record', async () => {
      const r = await req(baseUrl, 'POST', '/api/assets', {
        cookie: editorCookie,
        body: { name: 'Nginx', tag: '#web', current_version: '1.24', cve_start_date: '2024-01-01', active: 1 },
      });
      expect(r.status).toBe(201);
      expect(r.data.name).toBe('Nginx');
      expect(r.data.id).toBeGreaterThan(0);
      expect(typeof r.data.cve_count).toBe('number');
    });

    test('reader is blocked with 403', async () => {
      const r = await req(baseUrl, 'POST', '/api/assets', {
        cookie: readerCookie,
        body: { name: 'Blocked', tag: '#x', current_version: '1.0', cve_start_date: '2024-01-01' },
      });
      expect(r.status).toBe(403);
    });

    test('returns 400 for empty name', async () => {
      const r = await req(baseUrl, 'POST', '/api/assets', {
        cookie: editorCookie,
        body: { name: '', current_version: '1.0', cve_start_date: '2024-01-01' },
      });
      expect(r.status).toBe(400);
    });

    test('returns 400 for invalid cve_start_date format', async () => {
      const r = await req(baseUrl, 'POST', '/api/assets', {
        cookie: editorCookie,
        body: { name: 'App', current_version: '1.0', cve_start_date: '01/01/2024' },
      });
      expect(r.status).toBe(400);
    });

    test('returns 409 for duplicate name+tag', async () => {
      const body = { name: 'DupAsset', tag: '#dup', current_version: '1.0', cve_start_date: '2024-01-01' };
      await req(baseUrl, 'POST', '/api/assets', { cookie: editorCookie, body });
      const r = await req(baseUrl, 'POST', '/api/assets', { cookie: editorCookie, body });
      expect(r.status).toBe(409);
    });

    test('returns 401 without authentication', async () => {
      const r = await req(baseUrl, 'POST', '/api/assets', {
        body: { name: 'Unauth', current_version: '1.0', cve_start_date: '2024-01-01' },
      });
      expect(r.status).toBe(401);
    });
  });

  describe('GET /api/assets/:id', () => {
    test('returns existing asset with enriched fields', async () => {
      const created = await req(baseUrl, 'POST', '/api/assets', {
        cookie: editorCookie,
        body: { name: 'GetById', tag: '#gbi', current_version: '1.0', cve_start_date: '2024-01-01' },
      });
      const r = await req(baseUrl, 'GET', `/api/assets/${created.data.id}`, { cookie: readerCookie });
      expect(r.status).toBe(200);
      expect(r.data.id).toBe(created.data.id);
      expect('cve_count' in r.data).toBe(true);
    });

    test('returns 404 for unknown id', async () => {
      const r = await req(baseUrl, 'GET', '/api/assets/9999', { cookie: readerCookie });
      expect(r.status).toBe(404);
    });
  });

  describe('PUT /api/assets/:id', () => {
    test('editor can update asset fields', async () => {
      const created = await req(baseUrl, 'POST', '/api/assets', {
        cookie: editorCookie,
        body: { name: 'Updatable', tag: '#upd', current_version: '1.0', cve_start_date: '2024-01-01' },
      });
      const r = await req(baseUrl, 'PUT', `/api/assets/${created.data.id}`, {
        cookie: editorCookie,
        body: { name: 'Updatable', tag: '#upd', current_version: '2.0', cve_start_date: '2024-01-01', active: 1 },
      });
      expect(r.status).toBe(200);
      expect(r.data.current_version).toBe('2.0');
    });

    test('returns 404 for unknown id', async () => {
      const r = await req(baseUrl, 'PUT', '/api/assets/9999', {
        cookie: editorCookie,
        body: { name: 'X', current_version: '1.0', cve_start_date: '2024-01-01' },
      });
      expect(r.status).toBe(404);
    });
  });

  describe('DELETE /api/assets/:id', () => {
    test('editor can delete asset and receives 204', async () => {
      const created = await req(baseUrl, 'POST', '/api/assets', {
        cookie: editorCookie,
        body: { name: 'Deletable', tag: '#del', current_version: '1.0', cve_start_date: '2024-01-01' },
      });
      const r = await req(baseUrl, 'DELETE', `/api/assets/${created.data.id}`, { cookie: editorCookie });
      expect(r.status).toBe(204);
      const check = await req(baseUrl, 'GET', `/api/assets/${created.data.id}`, { cookie: readerCookie });
      expect(check.status).toBe(404);
    });

    test('returns 404 for unknown id', async () => {
      const r = await req(baseUrl, 'DELETE', '/api/assets/9999', { cookie: editorCookie });
      expect(r.status).toBe(404);
    });
  });

  describe('PATCH /api/assets/:id/toggle', () => {
    test('flips active from 1 to 0', async () => {
      const created = await req(baseUrl, 'POST', '/api/assets', {
        cookie: editorCookie,
        body: { name: 'Toggle1', tag: '#tog1', current_version: '1.0', cve_start_date: '2024-01-01', active: 1 },
      });
      const r = await req(baseUrl, 'PATCH', `/api/assets/${created.data.id}/toggle`, { cookie: editorCookie });
      expect(r.status).toBe(200);
      expect(r.data.active).toBe(0);
    });

    test('flips active from 0 to 1', async () => {
      const created = await req(baseUrl, 'POST', '/api/assets', {
        cookie: editorCookie,
        body: { name: 'Toggle0', tag: '#tog0', current_version: '1.0', cve_start_date: '2024-01-01', active: 0 },
      });
      const r = await req(baseUrl, 'PATCH', `/api/assets/${created.data.id}/toggle`, { cookie: editorCookie });
      expect(r.status).toBe(200);
      expect(r.data.active).toBe(1);
    });

    test('reader is blocked with 403', async () => {
      const created = await req(baseUrl, 'POST', '/api/assets', {
        cookie: editorCookie,
        body: { name: 'ToggleR', tag: '#togr', current_version: '1.0', cve_start_date: '2024-01-01' },
      });
      const r = await req(baseUrl, 'PATCH', `/api/assets/${created.data.id}/toggle`, { cookie: readerCookie });
      expect(r.status).toBe(403);
    });
  });
});
