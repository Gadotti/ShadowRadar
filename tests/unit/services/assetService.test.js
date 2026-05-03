'use strict';

const assetService = require('../../../src/services/assetService');
const { ValidationError, NotFoundError, ConflictError } = require('../../../src/models/errors');
const { makeDb, seedAsset } = require('../../helpers/db');

describe('assetService', () => {
  let db;

  beforeEach(() => { db = makeDb(); });

  describe('createAsset', () => {
    test('creates asset and returns enriched record', () => {
      const asset = assetService.createAsset(db, {
        name: 'Nginx', tag: '#web', url: 'https://nginx.com',
        current_version: '1.24.0', cve_start_date: '2024-01-01', active: 1,
      });
      expect(asset.name).toBe('Nginx');
      expect(asset.tag).toBe('#web');
      expect(typeof asset.cve_count).toBe('number');
    });

    test('throws ValidationError for missing name', () => {
      expect(() => assetService.createAsset(db, { name: '', current_version: '1.0', cve_start_date: '2024-01-01' }))
        .toThrow(ValidationError);
    });

    test('throws ValidationError for missing current_version', () => {
      expect(() => assetService.createAsset(db, { name: 'App', current_version: '', cve_start_date: '2024-01-01' }))
        .toThrow(ValidationError);
    });

    test('throws ValidationError for invalid cve_start_date format', () => {
      expect(() => assetService.createAsset(db, { name: 'App', current_version: '1.0', cve_start_date: '01-01-2024' }))
        .toThrow(ValidationError);
    });

    test('throws ValidationError for future cve_start_date', () => {
      expect(() => assetService.createAsset(db, { name: 'App', current_version: '1.0', cve_start_date: '2099-01-01' }))
        .toThrow(ValidationError);
    });

    test('throws ConflictError for duplicate name+tag', () => {
      assetService.createAsset(db, { name: 'App', tag: '#t1', current_version: '1.0', cve_start_date: '2024-01-01' });
      expect(() => assetService.createAsset(db, { name: 'App', tag: '#t1', current_version: '2.0', cve_start_date: '2024-01-01' }))
        .toThrow(ConflictError);
    });
  });

  describe('getAsset', () => {
    test('returns enriched asset for valid id', () => {
      const id = seedAsset(db);
      const asset = assetService.getAsset(db, id);
      expect(asset.id).toBe(id);
      expect('cve_count' in asset).toBe(true);
      expect('last_scan' in asset).toBe(true);
    });

    test('throws NotFoundError for unknown id', () => {
      expect(() => assetService.getAsset(db, 9999)).toThrow(NotFoundError);
    });
  });

  describe('updateAsset', () => {
    test('updates and returns the updated record', () => {
      const id = seedAsset(db);
      const updated = assetService.updateAsset(db, id, {
        name: 'Updated', tag: '#srv', url: 'https://updated.com',
        current_version: '2.0.0', cve_start_date: '2024-01-01', active: 1,
      });
      expect(updated.name).toBe('Updated');
      expect(updated.current_version).toBe('2.0.0');
    });

    test('throws NotFoundError for unknown id', () => {
      expect(() => assetService.updateAsset(db, 9999, { name: 'X', current_version: '1.0', cve_start_date: '2024-01-01' }))
        .toThrow(NotFoundError);
    });
  });

  describe('deleteAsset', () => {
    test('deletes existing asset without error', () => {
      const id = seedAsset(db);
      expect(() => assetService.deleteAsset(db, id)).not.toThrow();
      expect(() => assetService.getAsset(db, id)).toThrow(NotFoundError);
    });

    test('throws NotFoundError for unknown id', () => {
      expect(() => assetService.deleteAsset(db, 9999)).toThrow(NotFoundError);
    });
  });

  describe('toggleActive', () => {
    test('flips active from 1 to 0', () => {
      const id = seedAsset(db, { active: 1 });
      const result = assetService.toggleActive(db, id);
      expect(result.active).toBe(0);
    });

    test('flips active from 0 to 1', () => {
      const id = seedAsset(db, { active: 0 });
      const result = assetService.toggleActive(db, id);
      expect(result.active).toBe(1);
    });

    test('throws NotFoundError for unknown id', () => {
      expect(() => assetService.toggleActive(db, 9999)).toThrow(NotFoundError);
    });
  });

  describe('listAssets', () => {
    test('returns paginated structure', () => {
      seedAsset(db, { name: 'A', tag: '#a' });
      seedAsset(db, { name: 'B', tag: '#b' });
      const result = assetService.listAssets(db, { page: 1, page_size: 10 });
      expect(result.total).toBeGreaterThanOrEqual(2);
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.page).toBe(1);
    });

    test('clamps page_size to max 100', () => {
      const result = assetService.listAssets(db, { page_size: '500' });
      expect(result.page_size).toBe(100);
    });
  });
});
