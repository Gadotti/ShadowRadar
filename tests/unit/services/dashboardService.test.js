'use strict';

const dashboardService = require('../../../src/services/dashboardService');
const { makeDb, seedAsset, seedCve } = require('../../helpers/db');

describe('dashboardService', () => {
  let db;
  beforeEach(() => {
    db = makeDb();
    const id = seedAsset(db);
    seedCve(db, id, { cve_id: 'CVE-2024-0001', severity: 'HIGH',     published_at: '2024-03-01' });
    seedCve(db, id, { cve_id: 'CVE-2024-0002', severity: 'CRITICAL', published_at: '2024-04-01' });
  });

  describe('getDashboardData', () => {
    test('returns all required top-level sections', () => {
      const data = dashboardService.getDashboardData(db, {});
      expect('kpis' in data).toBe(true);
      expect('severity_distribution' in data).toBe(true);
      expect('cves_by_asset' in data).toBe(true);
      expect('cves_by_month' in data).toBe(true);
      expect('assessment_distribution' in data).toBe(true);
      expect('ai_coverage' in data).toBe(true);
    });

    test('kpis contains active_assets >= 1 and total_cves >= 2', () => {
      const { kpis } = dashboardService.getDashboardData(db, {});
      expect(kpis.active_assets).toBeGreaterThanOrEqual(1);
      expect(kpis.total_cves).toBeGreaterThanOrEqual(2);
    });

    test('severity_distribution has CRITICAL and HIGH counts', () => {
      const { severity_distribution } = dashboardService.getDashboardData(db, {});
      expect(severity_distribution.CRITICAL).toBe(1);
      expect(severity_distribution.HIGH).toBe(1);
    });

    test('severity_distribution always includes all severity keys', () => {
      const { severity_distribution } = dashboardService.getDashboardData(db, {});
      for (const key of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE']) {
        expect(key in severity_distribution).toBe(true);
      }
    });

    test('period 30d excludes CVEs published more than 30 days ago', () => {
      // seeds have published_at in 2024, which is > 30 days ago
      const data = dashboardService.getDashboardData(db, { period: '30d' });
      expect(data.kpis.total_cves).toBe(0);
    });

    test('period 90d also excludes old CVEs', () => {
      const data = dashboardService.getDashboardData(db, { period: '90d' });
      expect(data.kpis.total_cves).toBe(0);
    });

    test('period custom with date_from and date_to filters correctly', () => {
      const data = dashboardService.getDashboardData(db, {
        period: 'custom',
        date_from: '2024-03-01',
        date_to: '2024-03-31',
      });
      expect(data.kpis.total_cves).toBe(1);
    });

    test('no period returns all CVEs', () => {
      const data = dashboardService.getDashboardData(db, {});
      expect(data.kpis.total_cves).toBe(2);
    });

    test('ai_coverage has total, with_ai, and percentage', () => {
      const { ai_coverage } = dashboardService.getDashboardData(db, {});
      expect('total' in ai_coverage).toBe(true);
      expect('with_ai' in ai_coverage).toBe(true);
      expect('percentage' in ai_coverage).toBe(true);
    });
  });

  describe('getAssetOptions', () => {
    test('returns array of active assets with id, name, tag', () => {
      const options = dashboardService.getAssetOptions(db);
      expect(Array.isArray(options)).toBe(true);
      expect(options.length).toBeGreaterThanOrEqual(1);
      expect('id' in options[0]).toBe(true);
      expect('name' in options[0]).toBe(true);
    });

    test('inactive assets are excluded', () => {
      seedAsset(db, { name: 'Inactive', tag: '#off', active: 0 });
      const options = dashboardService.getAssetOptions(db);
      expect(options.every(o => o.name !== 'Inactive')).toBe(true);
    });
  });
});
