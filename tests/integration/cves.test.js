'use strict';

const os   = require('os');
const path = require('path');

process.env.JWT_SECRET = 'test-jwt-secret-minimum-32-chars-xxxx';
process.env.DB_PATH    = path.join(os.tmpdir(), `sr-int-cves-${Date.now()}.db`);

const { getDb }         = require('../../src/db/connection');
const { runMigrations } = require('../../src/db/migrate');
const { seedUsers, seedAsset, seedCve } = require('../helpers/db');
const { startApp, stopApp, cleanupDb, req, loginAs } = require('../helpers/app');

describe('cve routes', () => {
  let server, baseUrl, editorCookie, readerCookie, cveId;

  beforeAll(async () => {
    const db = getDb();
    runMigrations(db);
    await seedUsers(db);
    const assetId = seedAsset(db, { active: 1 });
    cveId = seedCve(db, assetId, { cve_id: 'CVE-2024-0001', severity: 'HIGH' });
    seedCve(db, assetId, { cve_id: 'CVE-2024-0002', severity: 'CRITICAL' });
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

  describe('GET /api/cves', () => {
    test('reader can list CVEs with paginated structure', async () => {
      const r = await req(baseUrl, 'GET', '/api/cves', { cookie: readerCookie });
      expect(r.status).toBe(200);
      expect(r.data.total).toBeGreaterThanOrEqual(2);
      expect(Array.isArray(r.data.items)).toBe(true);
      expect('last_scan' in r.data).toBe(true);
    });

    test('severity filter returns matching CVEs only', async () => {
      const r = await req(baseUrl, 'GET', '/api/cves?severity=HIGH', { cookie: editorCookie });
      expect(r.status).toBe(200);
      expect(r.data.total).toBe(1);
      expect(r.data.items[0].severity).toBe('HIGH');
    });

    test('returns 401 without authentication', async () => {
      const r = await req(baseUrl, 'GET', '/api/cves');
      expect(r.status).toBe(401);
    });
  });

  describe('GET /api/cves/macro', () => {
    test('returns rows array with risk and alert for each asset, plus last_scan', async () => {
      const r = await req(baseUrl, 'GET', '/api/cves/macro', { cookie: readerCookie });
      expect(r.status).toBe(200);
      expect(Array.isArray(r.data.rows)).toBe(true);
      expect('last_scan' in r.data).toBe(true);
      if (r.data.rows.length > 0) {
        expect('risk'     in r.data.rows[0]).toBe(true);
        expect('alert'    in r.data.rows[0]).toBe(true);
        expect('asset_id' in r.data.rows[0]).toBe(true);
      }
    });
  });

  describe('GET /api/cves/:id', () => {
    test('returns existing CVE with asset fields', async () => {
      const r = await req(baseUrl, 'GET', `/api/cves/${cveId}`, { cookie: readerCookie });
      expect(r.status).toBe(200);
      expect(r.data.id).toBe(cveId);
      expect('asset_name' in r.data).toBe(true);
    });

    test('returns 404 for unknown id', async () => {
      const r = await req(baseUrl, 'GET', '/api/cves/9999', { cookie: readerCookie });
      expect(r.status).toBe(404);
    });
  });

  describe('PUT /api/cves/:id/assessment', () => {
    test('editor can update assessment', async () => {
      const r = await req(baseUrl, 'PUT', `/api/cves/${cveId}/assessment`, {
        cookie: editorCookie,
        body: { user_assessment: 'Accepted Risk', user_notes: 'Noted' },
      });
      expect(r.status).toBe(200);
      expect(r.data.user_assessment).toBe('Accepted Risk');
    });

    test('reader is blocked with 403', async () => {
      const r = await req(baseUrl, 'PUT', `/api/cves/${cveId}/assessment`, {
        cookie: readerCookie,
        body: { user_assessment: 'Accepted Risk' },
      });
      expect(r.status).toBe(403);
    });

    test('returns 400 for invalid assessment value', async () => {
      const r = await req(baseUrl, 'PUT', `/api/cves/${cveId}/assessment`, {
        cookie: editorCookie,
        body: { user_assessment: 'InvalidValue' },
      });
      expect(r.status).toBe(400);
    });

    test('returns 404 for unknown CVE id', async () => {
      const r = await req(baseUrl, 'PUT', '/api/cves/9999/assessment', {
        cookie: editorCookie,
        body: { user_assessment: null },
      });
      expect(r.status).toBe(404);
    });
  });
});
