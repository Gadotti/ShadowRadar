'use strict';

const bcrypt = require('bcrypt');

process.env.JWT_SECRET = 'test-jwt-secret-minimum-32-chars-xxxx';

const { login, verifyToken } = require('../../../src/services/authService');
const { makeDb } = require('../../helpers/db');

describe('authService', () => {
  let db;

  beforeAll(async () => {
    db = makeDb();
    const hash = await bcrypt.hash('secret', 4);
    db.prepare('INSERT INTO users (name, username, password_hash, role) VALUES (?,?,?,?)').run('Alice', 'alice', hash, 'editor');
  });

  describe('login', () => {
    test('valid credentials return token and user object', async () => {
      const result = await login(db, 'alice', 'secret');
      expect(result.token).toBeTruthy();
      expect(result.user.username).toBe('alice');
      expect(result.user.role).toBe('editor');
      expect(result.user.password_hash).toBeFalsy();
    });

    test('unknown username throws generic error', async () => {
      await expect(login(db, 'nobody', 'secret')).rejects.toThrow(/Invalid credentials/);
    });

    test('wrong password throws generic error', async () => {
      await expect(login(db, 'alice', 'wrong')).rejects.toThrow(/Invalid credentials/);
    });

    test('empty username throws', async () => {
      await expect(login(db, '', 'secret')).rejects.toThrow();
    });
  });

  describe('verifyToken', () => {
    test('valid token returns payload with userId and role', async () => {
      const { token } = await login(db, 'alice', 'secret');
      const payload = verifyToken(token);
      expect(payload.username).toBe('alice');
      expect(payload.role).toBe('editor');
      expect(payload.userId).toBeTruthy();
    });

    test('tampered token throws', () => {
      expect(() => verifyToken('invalid.token.here')).toThrow(/invalid/i);
    });

    test('token signed with wrong secret throws', () => {
      const jwt = require('jsonwebtoken');
      const bad = jwt.sign({ userId: 1 }, 'wrong-secret');
      expect(() => verifyToken(bad)).toThrow();
    });
  });
});
