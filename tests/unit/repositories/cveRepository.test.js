'use strict';

const repo = require('../../../src/repositories/cveRepository');
const { makeDb, seedAsset, seedCve } = require('../../helpers/db');

describe('cveRepository', () => {
  let db, assetId;
  beforeEach(() => {
    db = makeDb();
    assetId = seedAsset(db);
  });

  describe('findAll', () => {
    test('returns items array and numeric total', () => {
      seedCve(db, assetId);
      const { items, total } = repo.findAll(db);
      expect(total).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(items)).toBe(true);
    });

    test('items include asset_name from join', () => {
      seedCve(db, assetId);
      const { items } = repo.findAll(db);
      expect('asset_name' in items[0]).toBe(true);
    });

    test('filters by asset_id', () => {
      const other = seedAsset(db, { name: 'Other', tag: '#o' });
      seedCve(db, assetId, { cve_id: 'CVE-2024-0001' });
      seedCve(db, other,   { cve_id: 'CVE-2024-0002' });
      const { total } = repo.findAll(db, { asset_id: assetId });
      expect(total).toBe(1);
    });

    test('filters by severity array', () => {
      seedCve(db, assetId, { cve_id: 'CVE-2024-0001', severity: 'HIGH' });
      seedCve(db, assetId, { cve_id: 'CVE-2024-0002', severity: 'LOW' });
      const { total } = repo.findAll(db, { severity: ['HIGH'] });
      expect(total).toBe(1);
    });

    test('filters by search matching cve_id', () => {
      seedCve(db, assetId, { cve_id: 'CVE-2024-FINDME' });
      const { items } = repo.findAll(db, { search: 'FINDME' });
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items[0].cve_id).toBe('CVE-2024-FINDME');
    });

    test('PENDING user_assessment filter returns only null assessments', () => {
      seedCve(db, assetId, { cve_id: 'CVE-2024-0001', user_assessment: null });
      seedCve(db, assetId, { cve_id: 'CVE-2024-0002', user_assessment: 'Accepted Risk' });
      const { total } = repo.findAll(db, { user_assessment: ['PENDING'] });
      expect(total).toBe(1);
    });

    test('has_ai_assessment=true filters to CVEs with ai_assessment set', () => {
      seedCve(db, assetId, { cve_id: 'CVE-2024-0001', ai_assessment: 'High risk' });
      seedCve(db, assetId, { cve_id: 'CVE-2024-0002', ai_assessment: null });
      const { total } = repo.findAll(db, { has_ai_assessment: true });
      expect(total).toBe(1);
    });

    test('has_ai_assessment=false filters to CVEs without ai_assessment', () => {
      seedCve(db, assetId, { cve_id: 'CVE-2024-0001', ai_assessment: 'High risk' });
      seedCve(db, assetId, { cve_id: 'CVE-2024-0002', ai_assessment: null });
      const { total } = repo.findAll(db, { has_ai_assessment: false });
      expect(total).toBe(1);
    });

    test('filters by published_after', () => {
      seedCve(db, assetId, { cve_id: 'CVE-2024-0001', published_at: '2024-01-01' });
      seedCve(db, assetId, { cve_id: 'CVE-2024-0002', published_at: '2024-06-01' });
      const { total } = repo.findAll(db, { published_after: '2024-03-01' });
      expect(total).toBe(1);
    });

    test('active_assets_only excludes inactive asset CVEs', () => {
      const inactiveId = seedAsset(db, { name: 'Inactive', tag: '#off', active: 0 });
      seedCve(db, assetId,    { cve_id: 'CVE-2024-0001' });
      seedCve(db, inactiveId, { cve_id: 'CVE-2024-0002' });
      const { total } = repo.findAll(db, { active_assets_only: true });
      expect(total).toBe(1);
    });
  });

  describe('getMacroView', () => {
    test('returns per-asset CVE breakdown with severity counts', () => {
      seedCve(db, assetId, { cve_id: 'CVE-2024-0001', severity: 'CRITICAL' });
      seedCve(db, assetId, { cve_id: 'CVE-2024-0002', severity: 'HIGH' });
      const rows = repo.getMacroView(db);
      const row = rows.find(r => r.asset_id === assetId);
      expect(row).toBeTruthy();
      expect(row.critical).toBe(1);
      expect(row.high).toBe(1);
      expect(row.total).toBe(2);
    });

    test('risk_level is 0 for asset with excluded assessments', () => {
      seedCve(db, assetId, { severity: 'HIGH', user_assessment: 'Not Affected' });
      const rows = repo.getMacroView(db);
      const row = rows.find(r => r.asset_id === assetId);
      expect(row.risk_level).toBe(0);
    });
  });

  describe('findById', () => {
    test('returns CVE with joined asset data', () => {
      const id = seedCve(db, assetId);
      const cve = repo.findById(db, id);
      expect(cve.id).toBe(id);
      expect('asset_name' in cve).toBe(true);
      expect('asset_tag' in cve).toBe(true);
    });

    test('returns undefined for unknown id', () => {
      expect(repo.findById(db, 9999)).toBeUndefined();
    });
  });

  describe('updateAssessment', () => {
    test('updates user_assessment and user_notes', () => {
      const id = seedCve(db, assetId);
      repo.updateAssessment(db, id, { user_assessment: 'Accepted Risk', user_notes: 'noted' });
      const cve = repo.findById(db, id);
      expect(cve.user_assessment).toBe('Accepted Risk');
      expect(cve.user_notes).toBe('noted');
    });

    test('sets evaluated_at timestamp', () => {
      const id = seedCve(db, assetId);
      repo.updateAssessment(db, id, { user_assessment: null, user_notes: null });
      const cve = repo.findById(db, id);
      expect(cve.evaluated_at).toBeTruthy();
    });
  });

  describe('getLastScanInfo', () => {
    test('returns null last_completed_at when no completed scan', () => {
      const { last_completed_at } = repo.getLastScanInfo(db);
      expect(last_completed_at).toBeNull();
    });

    test('returns most recent completed scan timestamp', () => {
      db.prepare(
        'INSERT INTO scan_runs (started_at, finished_at, status) VALUES (?,?,?)'
      ).run('2024-01-01T00:00:00Z', '2024-01-01T01:00:00Z', 'completed');
      const { last_completed_at } = repo.getLastScanInfo(db);
      expect(last_completed_at).toBeTruthy();
    });

    test('ignores non-completed scan runs', () => {
      db.prepare(
        'INSERT INTO scan_runs (started_at, finished_at, status) VALUES (?,?,?)'
      ).run('2024-01-01T00:00:00Z', null, 'running');
      const { last_completed_at } = repo.getLastScanInfo(db);
      expect(last_completed_at).toBeNull();
    });
  });
});
