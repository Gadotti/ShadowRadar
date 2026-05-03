'use strict';

const os   = require('os');
const path = require('path');

process.env.JWT_SECRET = 'test-jwt-secret-minimum-32-chars-xxxx';
process.env.DB_PATH    = path.join(os.tmpdir(), `sr-int-auth-${Date.now()}.db`);

const { getDb }         = require('../../src/db/connection');
const { runMigrations } = require('../../src/db/migrate');
const { seedUsers }     = require('../helpers/db');
const { startApp, stopApp, cleanupDb, req, loginAs } = require('../helpers/app');

describe('auth routes', () => {
  let server, baseUrl;

  beforeAll(async () => {
    const db = getDb();
    runMigrations(db);
    await seedUsers(db);
    const info = await startApp();
    server  = info.server;
    baseUrl = info.baseUrl;
  });

  afterAll(async () => {
    await stopApp(server);
    cleanupDb(process.env.DB_PATH);
  });

  describe('POST /api/auth/login', () => {
    test('valid credentials return user and set httpOnly cookie', async () => {
      const r = await req(baseUrl, 'POST', '/api/auth/login', {
        body: { username: 'editor', password: 'test123' },
      });
      expect(r.status).toBe(200);
      expect(r.data.user).toBeTruthy();
      expect(r.data.user.username).toBe('editor');
      expect(r.data.user.password_hash).toBeFalsy();
      const setCookie = r.headers.get('set-cookie') || '';
      expect(setCookie.includes('token=')).toBe(true);
      expect(setCookie.toLowerCase().includes('httponly')).toBe(true);
    });

    test('wrong password returns 401', async () => {
      const r = await req(baseUrl, 'POST', '/api/auth/login', {
        body: { username: 'editor', password: 'wrong' },
      });
      expect(r.status).toBe(401);
    });

    test('unknown username returns 401', async () => {
      const r = await req(baseUrl, 'POST', '/api/auth/login', {
        body: { username: 'nobody', password: 'test123' },
      });
      expect(r.status).toBe(401);
    });

    test('missing body fields return 401', async () => {
      const r = await req(baseUrl, 'POST', '/api/auth/login', { body: {} });
      expect(r.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    test('returns ok:true and clears token cookie', async () => {
      const cookie = await loginAs(baseUrl, 'editor');
      const r = await req(baseUrl, 'POST', '/api/auth/logout', { cookie });
      expect(r.status).toBe(200);
      expect(r.data.ok).toBe(true);
    });

    test('is idempotent — works without being logged in', async () => {
      const r = await req(baseUrl, 'POST', '/api/auth/logout');
      expect(r.status).toBe(200);
    });
  });

  describe('GET /api/auth/me', () => {
    test('returns current user payload from JWT', async () => {
      const cookie = await loginAs(baseUrl, 'editor');
      const r = await req(baseUrl, 'GET', '/api/auth/me', { cookie });
      expect(r.status).toBe(200);
      expect(r.data.user.username).toBe('editor');
      expect(r.data.user.role).toBe('editor');
    });

    test('returns 401 without a token cookie', async () => {
      const r = await req(baseUrl, 'GET', '/api/auth/me');
      expect(r.status).toBe(401);
    });
  });

  describe('GET /api/health', () => {
    test('returns ok status without authentication', async () => {
      const r = await req(baseUrl, 'GET', '/api/health');
      expect(r.status).toBe(200);
      expect(r.data.status).toBe('ok');
    });
  });
});
