'use strict';

const repo = require('../../../src/repositories/apiKeyRepository');
const { makeDb } = require('../../helpers/db');

describe('apiKeyRepository', () => {
  let db;
  beforeEach(() => { db = makeDb(); });

  const HASH  = 'a'.repeat(64);
  const HASH2 = 'b'.repeat(64);

  test('create inserts a key and returns numeric id', () => {
    const id = repo.create(db, { name: 'Test Key', keyHash: HASH });
    expect(id).toBeGreaterThan(0);
  });

  test('findByHash returns the key record', () => {
    repo.create(db, { name: 'Test Key', keyHash: HASH });
    const record = repo.findByHash(db, HASH);
    expect(record.name).toBe('Test Key');
    expect(record.key_hash).toBe(HASH);
  });

  test('findByHash returns undefined for unknown hash', () => {
    expect(repo.findByHash(db, 'z'.repeat(64))).toBeUndefined();
  });

  test('listAll returns all keys without exposing key_hash', () => {
    repo.create(db, { name: 'Key1', keyHash: HASH  });
    repo.create(db, { name: 'Key2', keyHash: HASH2 });
    const list = repo.listAll(db);
    expect(list.length).toBe(2);
    expect('key_hash' in list[0]).toBe(false);
    expect('created_at' in list[0]).toBe(true);
  });

  test('listAll returns keys ordered by id', () => {
    repo.create(db, { name: 'First',  keyHash: HASH  });
    repo.create(db, { name: 'Second', keyHash: HASH2 });
    const list = repo.listAll(db);
    expect(list[0].name).toBe('First');
    expect(list[1].name).toBe('Second');
  });

  test('updateLastUsed sets last_used_at on the record', () => {
    const id = repo.create(db, { name: 'Used', keyHash: HASH });
    repo.updateLastUsed(db, id);
    const record = repo.findByHash(db, HASH);
    expect(record.last_used_at).toBeTruthy();
  });

  test('remove deletes the key', () => {
    const id = repo.create(db, { name: 'Del', keyHash: HASH });
    repo.remove(db, id);
    expect(repo.findByHash(db, HASH)).toBeUndefined();
  });

  test('remove does not throw for non-existent id', () => {
    expect(() => repo.remove(db, 9999)).not.toThrow();
  });
});
