'use strict';

const os   = require('os');
const path = require('path');

process.env.JWT_SECRET = 'test-jwt-secret-minimum-32-chars-xxxx';
process.env.DB_PATH    = path.join(os.tmpdir(), `sr-int-sync-${Date.now()}.db`);

const { getDb }         = require('../../src/db/connection');
const { runMigrations } = require('../../src/db/migrate');
const { seedUsers }     = require('../helpers/db');
const { startApp, stopApp, cleanupDb, req } = require('../helpers/app');
const apiKeyService = require('../../src/services/apiKeyService');

describe('sync routes', () => {
  let server, baseUrl, plainApiKey;

  beforeAll(async () => {
    const db = getDb();
    runMigrations(db);
    await seedUsers(db);
    const keyResult = apiKeyService.createApiKey(db, 'sync-key');
    plainApiKey = keyResult.plainKey;
    const info = await startApp();
    server  = info.server;
    baseUrl = info.baseUrl;
  });

  afterAll(async () => {
    await stopApp(server);
    cleanupDb(process.env.DB_PATH);
  });

  describe('POST /api/v1/assets/sync', () => {
    test('creates new assets and returns created count', async () => {
      const r = await req(baseUrl, 'POST', '/api/v1/assets/sync', {
        apiKey: plainApiKey,
        body: {
          assets: [
            { name: 'SyncApp1', tag: '#s1', current_version: '1.0', cve_start_date: '2024-01-01' },
            { name: 'SyncApp2', tag: '#s2', current_version: '2.0', cve_start_date: '2024-01-01' },
          ],
        },
      });
      expect(r.status).toBe(200);
      expect(r.data.created).toBe(2);
      expect(r.data.updated).toBe(0);
      expect(r.data.errors.length).toBe(0);
    });

    test('updates existing assets and returns updated count', async () => {
      await req(baseUrl, 'POST', '/api/v1/assets/sync', {
        apiKey: plainApiKey,
        body: { assets: [{ name: 'UpdateMe', tag: '#um', current_version: '1.0', cve_start_date: '2024-01-01' }] },
      });
      const r = await req(baseUrl, 'POST', '/api/v1/assets/sync', {
        apiKey: plainApiKey,
        body: { assets: [{ name: 'UpdateMe', tag: '#um', current_version: '2.0' }] },
      });
      expect(r.status).toBe(200);
      expect(r.data.updated).toBe(1);
      expect(r.data.created).toBe(0);
      expect(r.data.errors.length).toBe(0);
    });

    test('does not overwrite cve_start_date on update', async () => {
      await req(baseUrl, 'POST', '/api/v1/assets/sync', {
        apiKey: plainApiKey,
        body: { assets: [{ name: 'DateGuard', tag: '#dg', current_version: '1.0', cve_start_date: '2022-01-01' }] },
      });
      await req(baseUrl, 'POST', '/api/v1/assets/sync', {
        apiKey: plainApiKey,
        body: { assets: [{ name: 'DateGuard', tag: '#dg', current_version: '2.0', cve_start_date: '2099-01-01' }] },
      });
      const db = getDb();
      const row = db.prepare("SELECT cve_start_date FROM assets WHERE name='DateGuard'").get();
      expect(row.cve_start_date).toBe('2022-01-01');
    });

    test('reports error for new asset missing cve_start_date', async () => {
      const r = await req(baseUrl, 'POST', '/api/v1/assets/sync', {
        apiKey: plainApiKey,
        body: { assets: [{ name: 'NoDate', tag: '#nd', current_version: '1.0' }] },
      });
      expect(r.status).toBe(200);
      expect(r.data.errors.length).toBe(1);
      expect(r.data.errors[0].error.includes('cve_start_date')).toBe(true);
    });

    test('reports error for asset missing name', async () => {
      const r = await req(baseUrl, 'POST', '/api/v1/assets/sync', {
        apiKey: plainApiKey,
        body: { assets: [{ current_version: '1.0', cve_start_date: '2024-01-01' }] },
      });
      expect(r.status).toBe(200);
      expect(r.data.errors.length).toBe(1);
    });

    test('partial batch: valid items succeed, invalid items report errors', async () => {
      const r = await req(baseUrl, 'POST', '/api/v1/assets/sync', {
        apiKey: plainApiKey,
        body: {
          assets: [
            { name: 'ValidPartial', tag: '#vp', current_version: '1.0', cve_start_date: '2024-01-01' },
            { current_version: '1.0', cve_start_date: '2024-01-01' }, // missing name
          ],
        },
      });
      expect(r.status).toBe(200);
      expect(r.data.created).toBe(1);
      expect(r.data.errors.length).toBe(1);
    });

    test('returns 401 without API key', async () => {
      const r = await req(baseUrl, 'POST', '/api/v1/assets/sync', {
        body: { assets: [] },
      });
      expect(r.status).toBe(401);
    });

    test('returns 400 when assets array is missing', async () => {
      const r = await req(baseUrl, 'POST', '/api/v1/assets/sync', {
        apiKey: plainApiKey,
        body: {},
      });
      expect(r.status).toBe(400);
    });

    test('accepts empty assets array gracefully', async () => {
      const r = await req(baseUrl, 'POST', '/api/v1/assets/sync', {
        apiKey: plainApiKey,
        body: { assets: [] },
      });
      expect(r.status).toBe(200);
      expect(r.data.created).toBe(0);
      expect(r.data.updated).toBe(0);
    });
  });
});
