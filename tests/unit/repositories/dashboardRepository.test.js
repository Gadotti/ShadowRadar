'use strict';

const repo = require('../../../src/repositories/dashboardRepository');
const { makeDb, seedAsset, seedCve } = require('../../helpers/db');

describe('dashboardRepository', () => {
  let db, assetId;
  beforeEach(() => {
    db = makeDb();
    assetId = seedAsset(db, { active: 1 });
    seedCve(db, assetId, {
      cve_id: 'CVE-2024-0001', severity: 'HIGH',
      published_at: '2024-03-01', user_assessment: null, ai_assessment: 'High risk',
    });
    seedCve(db, assetId, {
      cve_id: 'CVE-2024-0002', severity: 'CRITICAL',
      published_at: '2024-04-01', user_assessment: 'Accepted Risk', ai_assessment: null,
    });
  });

  describe('getKpis', () => {
    test('returns active_assets count', () => {
      const kpis = repo.getKpis(db);
      expect(kpis.active_assets).toBe(1);
    });

    test('returns total_cves count', () => {
      const kpis = repo.getKpis(db);
      expect(kpis.total_cves).toBe(2);
    });

    test('cves_pending_assessment counts only null user_assessment', () => {
      const kpis = repo.getKpis(db);
      expect(kpis.cves_pending_assessment).toBe(1);
    });

    test('cves_mitigating counts Acknowledge/Mitigating assessment', () => {
      seedCve(db, assetId, {
        cve_id: 'CVE-2024-0003', severity: 'LOW',
        published_at: '2024-05-01', user_assessment: 'Acknowledge/Mitigating',
      });
      const kpis = repo.getKpis(db);
      expect(kpis.cves_mitigating).toBe(1);
    });

    test('inactive assets are excluded', () => {
      const inactiveId = seedAsset(db, { name: 'Off', tag: '#off', active: 0 });
      seedCve(db, inactiveId, { cve_id: 'CVE-2024-X' });
      const kpis = repo.getKpis(db);
      expect(kpis.active_assets).toBe(1);
      expect(kpis.total_cves).toBe(2); // inactive CVE not counted
    });
  });

  describe('getSeverityDistribution', () => {
    test('returns severity count rows', () => {
      const rows = repo.getSeverityDistribution(db);
      const high = rows.find(r => r.severity === 'HIGH');
      expect(high).toBeTruthy();
      expect(high.count).toBe(1);
    });
  });

  describe('getCvesByAsset', () => {
    test('returns top assets by CVE count', () => {
      const rows = repo.getCvesByAsset(db);
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect('asset_id' in rows[0]).toBe(true);
      expect('total' in rows[0]).toBe(true);
      expect(rows[0].total).toBe(2);
    });

    test('limits to 10 results', () => {
      for (let i = 0; i < 12; i++) {
        const id = seedAsset(db, { name: `A${i}`, tag: `#t${i}`, active: 1 });
        seedCve(db, id, { cve_id: `CVE-EXTRA-${i}` });
      }
      const rows = repo.getCvesByAsset(db);
      expect(rows.length).toBeLessThanOrEqual(10);
    });
  });

  describe('getCvesByMonth', () => {
    test('returns monthly buckets with month and count', () => {
      const rows = repo.getCvesByMonth(db);
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect('month' in rows[0]).toBe(true);
      expect('count' in rows[0]).toBe(true);
    });

    test('month format is YYYY-MM', () => {
      const rows = repo.getCvesByMonth(db);
      expect(rows[0].month).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  describe('getAssessmentDistribution', () => {
    test('includes Pending for null user_assessment', () => {
      const rows = repo.getAssessmentDistribution(db);
      const pending = rows.find(r => r.assessment === 'Pending');
      expect(pending).toBeTruthy();
      expect(pending.count).toBe(1);
    });

    test('includes Accepted Risk', () => {
      const rows = repo.getAssessmentDistribution(db);
      const ar = rows.find(r => r.assessment === 'Accepted Risk');
      expect(ar).toBeTruthy();
      expect(ar.count).toBe(1);
    });
  });

  describe('getAiCoverage', () => {
    test('returns total, with_ai, and percentage', () => {
      const cov = repo.getAiCoverage(db);
      expect(cov.total).toBe(2);
      expect(cov.with_ai).toBe(1);
      expect(cov.percentage).toBe(50);
    });

    test('percentage is 0 when no CVEs', () => {
      const emptyDb = makeDb();
      seedAsset(emptyDb);
      const cov = repo.getAiCoverage(emptyDb);
      expect(cov.percentage).toBe(0);
    });
  });

  describe('getAssetOptions', () => {
    test('returns active assets with id, name, tag', () => {
      const opts = repo.getAssetOptions(db);
      expect(opts.length).toBeGreaterThanOrEqual(1);
      expect('id' in opts[0]).toBe(true);
      expect('name' in opts[0]).toBe(true);
    });

    test('excludes inactive assets', () => {
      seedAsset(db, { name: 'Inactive', tag: '#off', active: 0 });
      const opts = repo.getAssetOptions(db);
      expect(opts.every(o => o.name !== 'Inactive')).toBe(true);
    });
  });
});
