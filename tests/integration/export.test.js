'use strict';

const os   = require('os');
const path = require('path');

process.env.JWT_SECRET = 'test-jwt-secret-minimum-32-chars-xxxx';
process.env.DB_PATH    = path.join(os.tmpdir(), `sr-int-export-${Date.now()}.db`);

const { getDb }         = require('../../src/db/connection');
const { runMigrations } = require('../../src/db/migrate');
const { seedUsers, seedAsset, seedCve } = require('../helpers/db');
const { startApp, stopApp, cleanupDb, req, loginAs } = require('../helpers/app');
const apiKeyService = require('../../src/services/apiKeyService');

describe('export routes', () => {
  let server, baseUrl, editorCookie, plainApiKey;

  beforeAll(async () => {
    const db = getDb();
    runMigrations(db);
    await seedUsers(db);

    const assetId = seedAsset(db, { name: 'ExportApp', tag: '#exp', active: 1 });
    seedCve(db, assetId, { cve_id: 'CVE-2024-EXP1', severity: 'HIGH' });

    const keyResult = apiKeyService.createApiKey(db, 'export-key');
    plainApiKey = keyResult.plainKey;

    const info = await startApp();
    server       = info.server;
    baseUrl      = info.baseUrl;
    editorCookie = await loginAs(baseUrl, 'editor');
  });

  afterAll(async () => {
    await stopApp(server);
    cleanupDb(process.env.DB_PATH);
  });

  describe('GET /api/v1/export', () => {
    test('returns report with JWT cookie auth', async () => {
      const r = await req(baseUrl, 'GET', '/api/v1/export', { cookie: editorCookie });
      expect(r.status).toBe(200);
      expect('report_items' in r.data).toBe(true);
      expect(Array.isArray(r.data.report_items)).toBe(true);
      expect('last_scan' in r.data).toBe(true);
    });

    test('returns report with X-API-Key header auth', async () => {
      const r = await req(baseUrl, 'GET', '/api/v1/export', { apiKey: plainApiKey });
      expect(r.status).toBe(200);
      expect('report_items' in r.data).toBe(true);
    });

    test('returns 401 with no auth', async () => {
      const r = await req(baseUrl, 'GET', '/api/v1/export');
      expect(r.status).toBe(401);
    });

    test('returns 401 with invalid API key', async () => {
      const r = await req(baseUrl, 'GET', '/api/v1/export', { apiKey: 'sr_totally_invalid_key_xxxx' });
      expect(r.status).toBe(401);
    });

    test('report items include required fields', async () => {
      const r = await req(baseUrl, 'GET', '/api/v1/export', { cookie: editorCookie });
      const item = r.data.report_items.find(i => i.name === 'ExportApp');
      expect(item).toBeTruthy();
      expect('risk'  in item).toBe(true);
      expect('alert' in item).toBe(true);
      expect('id'    in item).toBe(true);
      expect(Array.isArray(item.cves)).toBe(true);
      expect(item.cves.length).toBeGreaterThanOrEqual(1);
    });

    test('CVE items include required fields', async () => {
      const r = await req(baseUrl, 'GET', '/api/v1/export', { cookie: editorCookie });
      const item = r.data.report_items.find(i => i.name === 'ExportApp');
      const cve = item.cves[0];
      expect('cve_id'               in cve).toBe(true);
      expect('severity'             in cve).toBe(true);
      expect('published_date'       in cve).toBe(true);
      expect('assessment'           in cve).toBe(true);
      expect('claude_ai_assessment' in cve).toBe(true);
    });

    test('Not Affected assessment does not inflate asset risk', async () => {
      const db = getDb();
      const safeId = seedAsset(db, { name: 'SafeApp', tag: '#safe', active: 1 });
      seedCve(db, safeId, {
        cve_id: 'CVE-2024-SAFE', severity: 'CRITICAL',
        user_assessment: 'Not Affected',
      });
      const r = await req(baseUrl, 'GET', '/api/v1/export', { cookie: editorCookie });
      const item = r.data.report_items.find(i => i.name === 'SafeApp');
      expect(item).toBeTruthy();
      expect(item.risk).toBe('None');
    });

    test('False Positive assessment does not inflate asset risk', async () => {
      const db = getDb();
      const fpId = seedAsset(db, { name: 'FpApp', tag: '#fp', active: 1 });
      seedCve(db, fpId, {
        cve_id: 'CVE-2024-FP', severity: 'HIGH',
        user_assessment: 'False Positive',
      });
      const r = await req(baseUrl, 'GET', '/api/v1/export', { cookie: editorCookie });
      const item = r.data.report_items.find(i => i.name === 'FpApp');
      expect(item).toBeTruthy();
      expect(item.risk).toBe('None');
    });

    test('active_only=false includes inactive assets', async () => {
      const db = getDb();
      seedAsset(db, { name: 'InactiveApp', tag: '#inactive', active: 0 });
      const r = await req(baseUrl, 'GET', '/api/v1/export?active_only=false', { cookie: editorCookie });
      const names = r.data.report_items.map(i => i.name);
      expect(names.includes('InactiveApp')).toBe(true);
    });
  });
});
