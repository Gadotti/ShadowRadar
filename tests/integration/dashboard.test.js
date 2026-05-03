'use strict';

const os   = require('os');
const path = require('path');

process.env.JWT_SECRET = 'test-jwt-secret-minimum-32-chars-xxxx';
process.env.DB_PATH    = path.join(os.tmpdir(), `sr-int-dashboard-${Date.now()}.db`);

const { getDb }         = require('../../src/db/connection');
const { runMigrations } = require('../../src/db/migrate');
const { seedUsers, seedAsset, seedCve } = require('../helpers/db');
const { startApp, stopApp, cleanupDb, req, loginAs } = require('../helpers/app');

describe('dashboard routes', () => {
  let server, baseUrl, cookie;

  beforeAll(async () => {
    const db = getDb();
    runMigrations(db);
    await seedUsers(db);
    const assetId = seedAsset(db, { active: 1 });
    seedCve(db, assetId, { cve_id: 'CVE-2024-DASH1', severity: 'HIGH',     published_at: '2024-03-01' });
    seedCve(db, assetId, { cve_id: 'CVE-2024-DASH2', severity: 'CRITICAL', published_at: '2024-04-01' });
    const info = await startApp();
    server  = info.server;
    baseUrl = info.baseUrl;
    cookie  = await loginAs(baseUrl, 'reader');
  });

  afterAll(async () => {
    await stopApp(server);
    cleanupDb(process.env.DB_PATH);
  });

  describe('GET /api/dashboard', () => {
    test('returns all required data sections', async () => {
      const r = await req(baseUrl, 'GET', '/api/dashboard', { cookie });
      expect(r.status).toBe(200);
      expect('kpis'                    in r.data).toBe(true);
      expect('severity_distribution'   in r.data).toBe(true);
      expect('cves_by_asset'           in r.data).toBe(true);
      expect('cves_by_month'           in r.data).toBe(true);
      expect('assessment_distribution' in r.data).toBe(true);
      expect('ai_coverage'             in r.data).toBe(true);
    });

    test('kpis reflect seeded data', async () => {
      const r = await req(baseUrl, 'GET', '/api/dashboard', { cookie });
      expect(r.data.kpis.total_cves).toBeGreaterThanOrEqual(2);
      expect(r.data.kpis.active_assets).toBeGreaterThanOrEqual(1);
    });

    test('severity_distribution includes all severity keys', async () => {
      const r = await req(baseUrl, 'GET', '/api/dashboard', { cookie });
      for (const key of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE']) {
        expect(key in r.data.severity_distribution).toBe(true);
      }
    });

    test('period=30d filter is accepted and returns subset', async () => {
      const r = await req(baseUrl, 'GET', '/api/dashboard?period=30d', { cookie });
      expect(r.status).toBe(200);
      // Seeded CVEs are from 2024, >30 days ago
      expect(r.data.kpis.total_cves).toBe(0);
    });

    test('period=custom with date_from/date_to works', async () => {
      const r = await req(baseUrl, 'GET', '/api/dashboard?period=custom&date_from=2024-03-01&date_to=2024-03-31', { cookie });
      expect(r.status).toBe(200);
      expect(r.data.kpis.total_cves).toBe(1);
    });

    test('returns 401 without authentication', async () => {
      const r = await req(baseUrl, 'GET', '/api/dashboard');
      expect(r.status).toBe(401);
    });
  });

  describe('GET /api/dashboard/assets', () => {
    test('returns array of active asset options', async () => {
      const r = await req(baseUrl, 'GET', '/api/dashboard/assets', { cookie });
      expect(r.status).toBe(200);
      expect(Array.isArray(r.data)).toBe(true);
      expect(r.data.length).toBeGreaterThanOrEqual(1);
      expect('id'   in r.data[0]).toBe(true);
      expect('name' in r.data[0]).toBe(true);
    });

    test('returns 401 without authentication', async () => {
      const r = await req(baseUrl, 'GET', '/api/dashboard/assets');
      expect(r.status).toBe(401);
    });
  });
});
