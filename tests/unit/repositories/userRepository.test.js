'use strict';

const repo = require('../../../src/repositories/userRepository');
const { makeDb, seedUsers } = require('../../helpers/db');

describe('userRepository', () => {
  let db;
  beforeEach(async () => {
    db = makeDb();
    await seedUsers(db);
  });

  describe('findById', () => {
    test('returns user without password_hash for valid id', () => {
      const user = repo.findByUsername(db, 'editor');
      const found = repo.findById(db, user.id);
      expect(found.id).toBe(user.id);
      expect(found.username).toBe('editor');
      expect('password_hash' in found).toBe(false);
    });

    test('returns undefined for unknown id', () => {
      expect(repo.findById(db, 9999)).toBeUndefined();
    });
  });

  describe('listAll', () => {
    test('returns all users ordered by created_at descending', () => {
      const users = repo.listAll(db);
      expect(users.length).toBe(2);
      expect(users.every(u => 'id' in u && 'name' in u && 'username' in u && 'role' in u && 'created_at' in u)).toBe(true);
    });

    test('does not expose password_hash', () => {
      const users = repo.listAll(db);
      expect(users.every(u => !('password_hash' in u))).toBe(true);
    });

    test('returns empty array when no users exist', () => {
      db.prepare('DELETE FROM users').run();
      expect(repo.listAll(db)).toEqual([]);
    });

    test('includes both editor and reader roles', () => {
      const roles = repo.listAll(db).map(u => u.role);
      expect(roles).toContain('editor');
      expect(roles).toContain('reader');
    });
  });

  describe('deleteById', () => {
    test('removes the user from the database', () => {
      const user = repo.findByUsername(db, 'reader');
      repo.deleteById(db, user.id);
      expect(repo.findById(db, user.id)).toBeUndefined();
    });

    test('does nothing for an unknown id', () => {
      const before = repo.listAll(db).length;
      repo.deleteById(db, 9999);
      expect(repo.listAll(db).length).toBe(before);
    });
  });
});
