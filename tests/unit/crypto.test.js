'use strict';

const crypto = require('crypto');
const { encrypt, decrypt } = require('../../src/crypto');

const VALID_KEY = crypto.randomBytes(32).toString('hex');

beforeEach(() => {
  process.env.ENCRYPTION_KEY = VALID_KEY;
});

afterEach(() => {
  delete process.env.ENCRYPTION_KEY;
});

describe('crypto', () => {
  describe('encrypt', () => {
    test('returns ivHex:tagHex:ciphertextHex format', () => {
      const parts = encrypt('hello').split(':');
      expect(parts).toHaveLength(3);
      parts.forEach(p => expect(p).toMatch(/^[0-9a-f]+$/));
    });

    test('IV is 12 bytes (24 hex chars)', () => {
      const [ivHex] = encrypt('hello').split(':');
      expect(ivHex).toHaveLength(24);
    });

    test('auth tag is 16 bytes (32 hex chars)', () => {
      const [, tagHex] = encrypt('hello').split(':');
      expect(tagHex).toHaveLength(32);
    });

    test('produces different ciphertext each call due to random IV', () => {
      const a = encrypt('same-plaintext');
      const b = encrypt('same-plaintext');
      expect(a).not.toBe(b);
    });

    test('throws when ENCRYPTION_KEY is absent', () => {
      delete process.env.ENCRYPTION_KEY;
      expect(() => encrypt('test')).toThrow(/ENCRYPTION_KEY/);
    });

    test('throws when ENCRYPTION_KEY is wrong length', () => {
      process.env.ENCRYPTION_KEY = 'tooshort';
      expect(() => encrypt('test')).toThrow(/ENCRYPTION_KEY/);
    });
  });

  describe('decrypt', () => {
    test('round-trips with encrypt', () => {
      const plaintext = 'sk-ant-api03-super-secret-key';
      expect(decrypt(encrypt(plaintext))).toBe(plaintext);
    });

    test('preserves special characters and unicode', () => {
      const plaintext = 'chave-com-acentuação!@#$%^&*()';
      expect(decrypt(encrypt(plaintext))).toBe(plaintext);
    });

    test('throws on malformed input with fewer than 3 parts', () => {
      expect(() => decrypt('onlyone')).toThrow();
      expect(() => decrypt('two:parts')).toThrow();
    });

    test('throws on tampered ciphertext (GCM authentication fails)', () => {
      const encrypted = encrypt('original-plaintext');
      const [iv, tag, data] = encrypted.split(':');
      const flippedByte = (parseInt(data.slice(-2), 16) ^ 0xff).toString(16).padStart(2, '0');
      expect(() => decrypt(`${iv}:${tag}:${data.slice(0, -2)}${flippedByte}`)).toThrow();
    });

    test('throws on tampered auth tag', () => {
      const encrypted = encrypt('original-plaintext');
      const [iv, tag, data] = encrypted.split(':');
      const flippedByte = (parseInt(tag.slice(-2), 16) ^ 0xff).toString(16).padStart(2, '0');
      expect(() => decrypt(`${iv}:${tag.slice(0, -2)}${flippedByte}:${data}`)).toThrow();
    });

    test('throws when ENCRYPTION_KEY is absent at decrypt time', () => {
      const encrypted = encrypt('test-value');
      delete process.env.ENCRYPTION_KEY;
      expect(() => decrypt(encrypted)).toThrow(/ENCRYPTION_KEY/);
    });

    test('throws when decrypted with a different key', () => {
      const encrypted = encrypt('test-value');
      process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
      expect(() => decrypt(encrypted)).toThrow();
    });
  });
});
