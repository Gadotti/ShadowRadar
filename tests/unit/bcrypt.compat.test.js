'use strict';

const bcrypt = require('bcrypt');

const PROD_ROUNDS = 12;

describe('bcrypt API compatibility', () => {
  describe('async hash + compare', () => {
    test('hash() produces a valid $2b$ bcrypt string', async () => {
      const hash = await bcrypt.hash('password', 4);
      expect(typeof hash).toBe('string');
      expect(hash).toMatch(/^\$2b\$/);
    });

    test('hash() embeds the requested cost factor', async () => {
      const hash = await bcrypt.hash('password', PROD_ROUNDS);
      expect(hash).toMatch(new RegExp(`^\\$2b\\$${PROD_ROUNDS}\\$`));
    });

    test('compare() returns true for the correct password', async () => {
      const hash = await bcrypt.hash('correct', 4);
      await expect(bcrypt.compare('correct', hash)).resolves.toBe(true);
    });

    test('compare() returns false for a wrong password', async () => {
      const hash = await bcrypt.hash('correct', 4);
      await expect(bcrypt.compare('wrong', hash)).resolves.toBe(false);
    });

    test('compare() returns false for an empty password against a real hash', async () => {
      const hash = await bcrypt.hash('correct', 4);
      await expect(bcrypt.compare('', hash)).resolves.toBe(false);
    });
  });

  describe('sync hashSync + compareSync', () => {
    test('hashSync() produces a valid $2b$ bcrypt string', () => {
      const hash = bcrypt.hashSync('password', 4);
      expect(typeof hash).toBe('string');
      expect(hash).toMatch(/^\$2b\$/);
    });

    test('compareSync() returns true for the correct password', () => {
      const hash = bcrypt.hashSync('correct', 4);
      expect(bcrypt.compareSync('correct', hash)).toBe(true);
    });

    test('compareSync() returns false for a wrong password', () => {
      const hash = bcrypt.hashSync('correct', 4);
      expect(bcrypt.compareSync('wrong', hash)).toBe(false);
    });
  });

  describe('cross-API compatibility', () => {
    test('hash from hashSync() is verifiable by compare()', async () => {
      const hash = bcrypt.hashSync('crosscheck', 4);
      await expect(bcrypt.compare('crosscheck', hash)).resolves.toBe(true);
    });

    test('hash from hash() is verifiable by compareSync()', async () => {
      const hash = await bcrypt.hash('crosscheck', 4);
      expect(bcrypt.compareSync('crosscheck', hash)).toBe(true);
    });
  });
});
