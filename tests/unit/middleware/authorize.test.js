'use strict';

const authorize = require('../../../src/middleware/authorize');

function makeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json   = (body)  => { res.body = body;       return res; };
  return res;
}

describe('authorize middleware', () => {
  test('allows editor on editor-required route', () => {
    const mw = authorize('editor');
    const req = { user: { role: 'editor' } };
    const res = makeRes();
    let called = false;
    mw(req, res, () => { called = true; });
    expect(called).toBe(true);
    expect(res.statusCode).toBeNull();
  });

  test('allows editor on reader-required route', () => {
    const mw = authorize('reader');
    const req = { user: { role: 'editor' } };
    const res = makeRes();
    let called = false;
    mw(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  test('allows reader on reader-required route', () => {
    const mw = authorize('reader');
    const req = { user: { role: 'reader' } };
    const res = makeRes();
    let called = false;
    mw(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  test('blocks reader on editor-required route with 403', () => {
    const mw = authorize('editor');
    const req = { user: { role: 'reader' } };
    const res = makeRes();
    let called = false;
    mw(req, res, () => { called = true; });
    expect(called).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBeTruthy();
  });

  test('blocks request with no user object with 403', () => {
    const mw = authorize('reader');
    const req = {};
    const res = makeRes();
    let called = false;
    mw(req, res, () => { called = true; });
    expect(called).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  test('blocks unknown role with 403', () => {
    const mw = authorize('editor');
    const req = { user: { role: 'admin' } };
    const res = makeRes();
    let called = false;
    mw(req, res, () => { called = true; });
    expect(called).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  test('blocks null user with 403', () => {
    const mw = authorize('reader');
    const req = { user: null };
    const res = makeRes();
    let called = false;
    mw(req, res, () => { called = true; });
    expect(called).toBe(false);
    expect(res.statusCode).toBe(403);
  });
});
