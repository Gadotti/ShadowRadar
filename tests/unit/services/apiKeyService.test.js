'use strict';

const apiKeyService = require('../../../src/services/apiKeyService');
const { makeDb } = require('../../helpers/db');

describe('apiKeyService', () => {
  let db;
  beforeEach(() => { db = makeDb(); });

  describe('generateKey', () => {
    test('starts with sr_ prefix', () => {
      const key = apiKeyService.generateKey();
      expect(key.startsWith('sr_')).toBe(true);
    });

    test('has sufficient length (sr_ + 40 hex chars)', () => {
      const key = apiKeyService.generateKey();
      expect(key.length).toBeGreaterThanOrEqual(43);
    });

    test('produces unique keys on each call', () => {
      const keys = new Set(Array.from({ length: 10 }, () => apiKeyService.generateKey()));
      expect(keys.size).toBe(10);
    });
  });

  describe('hashKey', () => {
    test('returns 64-char hex string (SHA-256)', () => {
      const hash = apiKeyService.hashKey('sr_abc123');
      expect(hash.length).toBe(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    test('is deterministic for same input', () => {
      expect(apiKeyService.hashKey('test')).toBe(apiKeyService.hashKey('test'));
    });

    test('produces different hashes for different inputs', () => {
      expect(apiKeyService.hashKey('key1')).not.toBe(apiKeyService.hashKey('key2'));
    });
  });

  describe('createApiKey', () => {
    test('returns plainKey with sr_ prefix, id, and created_at', () => {
      const result = apiKeyService.createApiKey(db, 'My Key');
      expect(result.plainKey.startsWith('sr_')).toBe(true);
      expect(result.id).toBeGreaterThan(0);
      expect(result.created_at).toBeTruthy();
      expect(result.name).toBe('My Key');
    });

    test('stores key as hash, not plain text', () => {
      const { plainKey } = apiKeyService.createApiKey(db, 'Test');
      const hash = apiKeyService.hashKey(plainKey);
      const row = db.prepare('SELECT * FROM api_keys WHERE key_hash = ?').get(hash);
      expect(row).toBeTruthy();
      expect(row.key_hash).not.toBe(plainKey);
    });

    test('different keys have different hashes', () => {
      const r1 = apiKeyService.createApiKey(db, 'Key1');
      const r2 = apiKeyService.createApiKey(db, 'Key2');
      expect(r1.plainKey).not.toBe(r2.plainKey);
    });
  });

  describe('validateKey', () => {
    test('returns record for a valid key', () => {
      const { plainKey } = apiKeyService.createApiKey(db, 'Valid');
      const record = apiKeyService.validateKey(db, plainKey);
      expect(record).toBeTruthy();
      expect(record.name).toBe('Valid');
    });

    test('returns null for unknown key', () => {
      const result = apiKeyService.validateKey(db, 'sr_notreal0000000000000000000000000000000000');
      expect(result).toBeNull();
    });

    test('returns null for empty string', () => {
      expect(apiKeyService.validateKey(db, '')).toBeNull();
    });

    test('returns null for null input', () => {
      expect(apiKeyService.validateKey(db, null)).toBeNull();
    });
  });
});
