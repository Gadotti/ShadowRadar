'use strict';

const cveService = require('../../../src/services/cveService');
const { ValidationError, NotFoundError } = require('../../../src/models/errors');
const { makeDb, seedAsset, seedCve } = require('../../helpers/db');

describe('cveService', () => {
  let db;
  beforeEach(() => { db = makeDb(); });

  describe('listCves', () => {
    test('returns paginated structure with last_scan field', () => {
      const assetId = seedAsset(db);
      seedCve(db, assetId);
      const result = cveService.listCves(db, {});
      expect(Array.isArray(result.items)).toBe(true);
      expect(typeof result.total).toBe('number');
      expect('last_scan' in result).toBe(true);
      expect(result.page).toBe(1);
      expect(result.page_size).toBe(50);
    });

    test('filters by severity', () => {
      const assetId = seedAsset(db);
      seedCve(db, assetId, { cve_id: 'CVE-2024-0001', severity: 'HIGH' });
      seedCve(db, assetId, { cve_id: 'CVE-2024-0002', severity: 'LOW' });
      const result = cveService.listCves(db, { severity: 'HIGH' });
      expect(result.total).toBe(1);
      expect(result.items[0].severity).toBe('HIGH');
    });

    test('clamps page_size to max 100', () => {
      const result = cveService.listCves(db, { page_size: '999' });
      expect(result.page_size).toBe(100);
    });

    test('defaults page to 1', () => {
      const result = cveService.listCves(db, {});
      expect(result.page).toBe(1);
    });
  });

  describe('getMacroView', () => {
    test('returns assets with risk label and alert', () => {
      const assetId = seedAsset(db);
      seedCve(db, assetId, { severity: 'CRITICAL' });
      const rows = cveService.getMacroView(db, {});
      const row = rows.find(r => r.asset_id === assetId);
      expect(row).toBeTruthy();
      expect(row.risk).toBe('CRITICAL');
      expect(row.alert).toBeTruthy();
    });

    test('excluded assessments lower risk to NONE', () => {
      const assetId = seedAsset(db);
      seedCve(db, assetId, { severity: 'HIGH', user_assessment: 'Not Affected' });
      const rows = cveService.getMacroView(db, {});
      const row = rows.find(r => r.asset_id === assetId);
      expect(row.risk).toBe('NONE');
    });

    test('False Positive assessment also excluded from risk', () => {
      const assetId = seedAsset(db);
      seedCve(db, assetId, { severity: 'CRITICAL', user_assessment: 'False Positive' });
      const rows = cveService.getMacroView(db, {});
      const row = rows.find(r => r.asset_id === assetId);
      expect(row.risk).toBe('NONE');
    });
  });

  describe('updateAssessment', () => {
    test('updates assessment and returns updated record', () => {
      const assetId = seedAsset(db);
      const cveId = seedCve(db, assetId);
      const updated = cveService.updateAssessment(db, cveId, {
        user_assessment: 'Accepted Risk', user_notes: 'ok',
      });
      expect(updated.user_assessment).toBe('Accepted Risk');
    });

    test('throws ValidationError for invalid assessment', () => {
      const assetId = seedAsset(db);
      const cveId = seedCve(db, assetId);
      expect(() => cveService.updateAssessment(db, cveId, { user_assessment: 'NotValid' }))
        .toThrow(ValidationError);
    });

    test('throws NotFoundError for unknown id', () => {
      expect(() => cveService.updateAssessment(db, 9999, { user_assessment: null }))
        .toThrow(NotFoundError);
    });

    test('clears assessment when null passed', () => {
      const assetId = seedAsset(db);
      const cveId = seedCve(db, assetId);
      cveService.updateAssessment(db, cveId, { user_assessment: 'Accepted Risk' });
      const cleared = cveService.updateAssessment(db, cveId, { user_assessment: null });
      expect(cleared.user_assessment).toBeNull();
    });

    test('accepts all valid assessment values', () => {
      const assetId = seedAsset(db);
      const validValues = ['Acknowledge/Mitigating', 'Accepted Risk', 'Not Affected', 'False Positive'];
      for (const val of validValues) {
        const cveId = seedCve(db, assetId, { cve_id: `CVE-2024-${val.replace(/\W/g, '')}` });
        expect(() => cveService.updateAssessment(db, cveId, { user_assessment: val })).not.toThrow();
      }
    });
  });
});
