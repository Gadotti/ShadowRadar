'use strict';

const os     = require('os');
const path   = require('path');
const crypto = require('crypto');

process.env.JWT_SECRET = 'test-jwt-secret-minimum-32-chars-xxxx';
process.env.DB_PATH    = path.join(os.tmpdir(), `sr-int-config-${Date.now()}.db`);

const { getDb }         = require('../../src/db/connection');
const { runMigrations } = require('../../src/db/migrate');
const { seedUsers, seedConfig } = require('../helpers/db');
const { startApp, stopApp, cleanupDb, req, loginAs } = require('../helpers/app');

const VALID_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');

const BASE_AI_BODY = {
  enabled:     false,
  api_url:     'https://api.anthropic.com',
  model:       'claude-sonnet-4-6',
  max_tokens:  1000,
  temperature: 0,
  batch_size:  10,
};

describe('config routes', () => {
  let server, baseUrl, editorCookie, readerCookie;

  beforeAll(async () => {
    const db = getDb();
    runMigrations(db);
    await seedUsers(db);
    seedConfig(db);
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

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  // ── NIST ─────────────────────────────────────────────────────────────────

  describe('GET /api/config/nist', () => {
    test('returns masked api_key and api_key_set=false initially', async () => {
      const r = await req(baseUrl, 'GET', '/api/config/nist', { cookie: editorCookie });
      expect(r.status).toBe(200);
      expect(r.data.api_key).toBe('****');
      expect(r.data.api_key_set).toBe(false);
      expect(typeof r.data.page_size).toBe('number');
    });

    test('reader is blocked with 403', async () => {
      const r = await req(baseUrl, 'GET', '/api/config/nist', { cookie: readerCookie });
      expect(r.status).toBe(403);
    });

    test('unauthenticated is blocked with 401', async () => {
      const r = await req(baseUrl, 'GET', '/api/config/nist');
      expect(r.status).toBe(401);
    });
  });

  describe('PUT /api/config/nist', () => {
    test('saves page_size and returns updated config', async () => {
      const r = await req(baseUrl, 'PUT', '/api/config/nist', {
        cookie: editorCookie,
        body: { page_size: 100 },
      });
      expect(r.status).toBe(200);
      expect(r.data.page_size).toBe(100);
    });

    test('saves api_key and reflects api_key_set=true', async () => {
      const r = await req(baseUrl, 'PUT', '/api/config/nist', {
        cookie: editorCookie,
        body: { page_size: 50, api_key: 'nvd-real-key' },
      });
      expect(r.status).toBe(200);
      expect(r.data.api_key_set).toBe(true);
      expect(r.data.api_key).toBe('****');
    });

    test('returns 400 for invalid page_size', async () => {
      const r = await req(baseUrl, 'PUT', '/api/config/nist', {
        cookie: editorCookie,
        body: { page_size: 9999 },
      });
      expect(r.status).toBe(400);
    });

    test('reader is blocked with 403', async () => {
      const r = await req(baseUrl, 'PUT', '/api/config/nist', {
        cookie: readerCookie,
        body: { page_size: 50 },
      });
      expect(r.status).toBe(403);
    });
  });

  // ── AI — general ─────────────────────────────────────────────────────────

  describe('GET /api/config/ai', () => {
    test('returns expected shape including api_key_source and has_direct_key', async () => {
      const r = await req(baseUrl, 'GET', '/api/config/ai', { cookie: editorCookie });
      expect(r.status).toBe(200);
      expect(typeof r.data.enabled).toBe('boolean');
      expect(['env_var', 'direct']).toContain(r.data.api_key_source);
      expect(typeof r.data.has_direct_key).toBe('boolean');
      expect(typeof r.data.api_key_env).toBe('string');
      expect(typeof r.data.max_tokens).toBe('number');
    });

    test('reader is blocked with 403', async () => {
      const r = await req(baseUrl, 'GET', '/api/config/ai', { cookie: readerCookie });
      expect(r.status).toBe(403);
    });

    test('unauthenticated is blocked with 401', async () => {
      const r = await req(baseUrl, 'GET', '/api/config/ai');
      expect(r.status).toBe(401);
    });
  });

  // ── AI — env_var mode ─────────────────────────────────────────────────────

  describe('PUT /api/config/ai — env_var mode', () => {
    test('saves env var name and returns api_key_source=env_var', async () => {
      const r = await req(baseUrl, 'PUT', '/api/config/ai', {
        cookie: editorCookie,
        body: { ...BASE_AI_BODY, api_key_source: 'env_var', api_key_env: 'ANTHROPIC_API_KEY' },
      });
      expect(r.status).toBe(200);
      expect(r.data.api_key_source).toBe('env_var');
      expect(r.data.api_key_env).toBe('ANTHROPIC_API_KEY');
      expect(r.data.has_direct_key).toBe(false);
    });

    test('allows empty env var name', async () => {
      const r = await req(baseUrl, 'PUT', '/api/config/ai', {
        cookie: editorCookie,
        body: { ...BASE_AI_BODY, api_key_source: 'env_var', api_key_env: '' },
      });
      expect(r.status).toBe(200);
      expect(r.data.api_key_env).toBe('');
    });

    test('returns 400 for invalid env var name', async () => {
      const r = await req(baseUrl, 'PUT', '/api/config/ai', {
        cookie: editorCookie,
        body: { ...BASE_AI_BODY, api_key_source: 'env_var', api_key_env: '123_INVALID' },
      });
      expect(r.status).toBe(400);
    });

    test('returns 400 for invalid api_url', async () => {
      const r = await req(baseUrl, 'PUT', '/api/config/ai', {
        cookie: editorCookie,
        body: { ...BASE_AI_BODY, api_url: 'not-a-valid-url' },
      });
      expect(r.status).toBe(400);
    });

    test('returns 400 for temperature out of range', async () => {
      const r = await req(baseUrl, 'PUT', '/api/config/ai', {
        cookie: editorCookie,
        body: { ...BASE_AI_BODY, temperature: 2 },
      });
      expect(r.status).toBe(400);
    });

    test('returns 400 for max_tokens < 1', async () => {
      const r = await req(baseUrl, 'PUT', '/api/config/ai', {
        cookie: editorCookie,
        body: { ...BASE_AI_BODY, max_tokens: 0 },
      });
      expect(r.status).toBe(400);
    });

    test('reader is blocked with 403', async () => {
      const r = await req(baseUrl, 'PUT', '/api/config/ai', {
        cookie: readerCookie,
        body: { ...BASE_AI_BODY },
      });
      expect(r.status).toBe(403);
    });
  });

  // ── AI — direct key mode ──────────────────────────────────────────────────

  describe('PUT /api/config/ai — direct key mode', () => {
    test('saves encrypted key and reports has_direct_key=true', async () => {
      process.env.ENCRYPTION_KEY = VALID_ENCRYPTION_KEY;
      const r = await req(baseUrl, 'PUT', '/api/config/ai', {
        cookie: editorCookie,
        body: { ...BASE_AI_BODY, api_key_source: 'direct', api_key_direct: 'sk-ant-test-key' },
      });
      expect(r.status).toBe(200);
      expect(r.data.api_key_source).toBe('direct');
      expect(r.data.has_direct_key).toBe(true);
      expect(r.data.api_key_env).toBe('');
    });

    test('returns 400 when ENCRYPTION_KEY env var is not set', async () => {
      const r = await req(baseUrl, 'PUT', '/api/config/ai', {
        cookie: editorCookie,
        body: { ...BASE_AI_BODY, api_key_source: 'direct', api_key_direct: 'sk-ant-test-key' },
      });
      expect(r.status).toBe(400);
    });

    test('keeps existing encrypted key when api_key_direct is blank', async () => {
      process.env.ENCRYPTION_KEY = VALID_ENCRYPTION_KEY;
      await req(baseUrl, 'PUT', '/api/config/ai', {
        cookie: editorCookie,
        body: { ...BASE_AI_BODY, api_key_source: 'direct', api_key_direct: 'sk-ant-original' },
      });
      const r = await req(baseUrl, 'PUT', '/api/config/ai', {
        cookie: editorCookie,
        body: { ...BASE_AI_BODY, api_key_source: 'direct', api_key_direct: '' },
      });
      expect(r.status).toBe(200);
      expect(r.data.has_direct_key).toBe(true);
    });

    test('switching to env_var clears the stored encrypted key', async () => {
      process.env.ENCRYPTION_KEY = VALID_ENCRYPTION_KEY;
      await req(baseUrl, 'PUT', '/api/config/ai', {
        cookie: editorCookie,
        body: { ...BASE_AI_BODY, api_key_source: 'direct', api_key_direct: 'sk-ant-clear-me' },
      });
      const r = await req(baseUrl, 'PUT', '/api/config/ai', {
        cookie: editorCookie,
        body: { ...BASE_AI_BODY, api_key_source: 'env_var', api_key_env: 'MY_KEY' },
      });
      expect(r.status).toBe(200);
      expect(r.data.api_key_source).toBe('env_var');
      expect(r.data.has_direct_key).toBe(false);
    });
  });
});
