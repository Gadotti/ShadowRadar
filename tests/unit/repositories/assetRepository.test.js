'use strict';

const repo = require('../../../src/repositories/assetRepository');
const { makeDb, seedAsset } = require('../../helpers/db');

describe('assetRepository', () => {
  let db;
  beforeEach(() => { db = makeDb(); });

  describe('findAll', () => {
    test('returns items array and numeric total', () => {
      seedAsset(db, { name: 'Alpha', tag: '#a' });
      seedAsset(db, { name: 'Beta',  tag: '#b' });
      const { items, total } = repo.findAll(db);
      expect(total).toBeGreaterThanOrEqual(2);
      expect(Array.isArray(items)).toBe(true);
    });

    test('each item includes cve_count and last_scan', () => {
      seedAsset(db);
      const { items } = repo.findAll(db);
      expect('cve_count' in items[0]).toBe(true);
      expect('last_scan' in items[0]).toBe(true);
    });

    test('filters by name search', () => {
      seedAsset(db, { name: 'Nginx', tag: '#web' });
      seedAsset(db, { name: 'Redis', tag: '#db'  });
      const { items } = repo.findAll(db, { search: 'Nginx' });
      expect(items.length).toBe(1);
      expect(items[0].name).toBe('Nginx');
    });

    test('filters active=1 excludes inactive assets', () => {
      seedAsset(db, { name: 'On',  tag: '#on',  active: 1 });
      seedAsset(db, { name: 'Off', tag: '#off', active: 0 });
      const { items } = repo.findAll(db, { active: '1' });
      expect(items.every(i => i.active === 1)).toBe(true);
    });

    test('paginates with page and pageSize', () => {
      for (let i = 0; i < 5; i++) seedAsset(db, { name: `A${i}`, tag: `#t${i}` });
      const { items } = repo.findAll(db, { page: 2, pageSize: 2 });
      expect(items.length).toBe(2);
    });
  });

  describe('findById', () => {
    test('returns the asset for a valid id', () => {
      const id = seedAsset(db);
      const asset = repo.findById(db, id);
      expect(asset.id).toBe(id);
    });

    test('returns undefined for unknown id', () => {
      expect(repo.findById(db, 9999)).toBeUndefined();
    });
  });

  describe('findByNameAndTag', () => {
    test('returns asset when name and tag match', () => {
      seedAsset(db, { name: 'App', tag: '#t1' });
      const asset = repo.findByNameAndTag(db, 'App', '#t1');
      expect(asset).toBeTruthy();
      expect(asset.name).toBe('App');
    });

    test('returns undefined when tag is null', () => {
      expect(repo.findByNameAndTag(db, 'App', null)).toBeUndefined();
    });

    test('returns undefined when tag does not match', () => {
      seedAsset(db, { name: 'App', tag: '#t1' });
      expect(repo.findByNameAndTag(db, 'App', '#t2')).toBeUndefined();
    });
  });

  describe('findByNameAndOptionalTag', () => {
    test('finds by name+tag when tag provided', () => {
      seedAsset(db, { name: 'App', tag: '#t1' });
      expect(repo.findByNameAndOptionalTag(db, 'App', '#t1')).toBeTruthy();
    });

    test('finds by name only when tag is null', () => {
      db.prepare(
        'INSERT INTO assets (name, tag, current_version, cve_start_date, active) VALUES (?,NULL,?,?,?)'
      ).run('NullTag', '1.0', '2024-01-01', 1);
      expect(repo.findByNameAndOptionalTag(db, 'NullTag', null)).toBeTruthy();
    });

    test('returns undefined when no match', () => {
      expect(repo.findByNameAndOptionalTag(db, 'NoSuch', '#x')).toBeUndefined();
    });
  });

  describe('create', () => {
    test('inserts a new asset and returns its id', () => {
      const id = repo.create(db, {
        name: 'New', tag: '#x', current_version: '1.0', cve_start_date: '2024-01-01',
      });
      expect(id).toBeGreaterThan(0);
      expect(repo.findById(db, id)).toBeTruthy();
    });
  });

  describe('update', () => {
    test('modifies the record fields', () => {
      const id = seedAsset(db);
      repo.update(db, id, {
        name: 'Updated', tag: '#u', current_version: '2.0',
        cve_start_date: '2024-01-01', active: 1,
      });
      const asset = repo.findById(db, id);
      expect(asset.name).toBe('Updated');
      expect(asset.current_version).toBe('2.0');
    });
  });

  describe('remove', () => {
    test('deletes the record', () => {
      const id = seedAsset(db);
      repo.remove(db, id);
      expect(repo.findById(db, id)).toBeUndefined();
    });
  });

  describe('setActive', () => {
    test('sets active to 0', () => {
      const id = seedAsset(db, { active: 1 });
      repo.setActive(db, id, 0);
      expect(repo.findById(db, id).active).toBe(0);
    });

    test('sets active to 1', () => {
      const id = seedAsset(db, { active: 0 });
      repo.setActive(db, id, 1);
      expect(repo.findById(db, id).active).toBe(1);
    });
  });

  describe('getCveCount', () => {
    test('returns 0 for asset with no CVEs', () => {
      const id = seedAsset(db);
      expect(repo.getCveCount(db, id)).toBe(0);
    });
  });

  describe('getLastScanDate', () => {
    test('returns null for asset with no CVEs', () => {
      const id = seedAsset(db);
      expect(repo.getLastScanDate(db, id)).toBeNull();
    });
  });
});
