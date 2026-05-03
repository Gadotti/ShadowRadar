'use strict';

const repo = require('../repositories/dashboardRepository');

function parseFilters(raw) {
  const asset_ids = raw.asset_ids
    ? raw.asset_ids.split(',').map(Number).filter(n => n > 0)
    : [];

  const severity = raw.severity
    ? raw.severity.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  let published_after  = null;
  let published_before = null;

  if (raw.period && raw.period !== 'custom') {
    const days = { '30d': 30, '90d': 90, '180d': 180 }[raw.period];
    if (days) {
      const d = new Date();
      d.setDate(d.getDate() - days);
      published_after = d.toISOString().slice(0, 10);
    }
  } else if (raw.period === 'custom') {
    published_after  = raw.date_from  || null;
    published_before = raw.date_to    || null;
  }

  return { asset_ids, severity, published_after, published_before };
}

function toSeverityMap(rows) {
  const map = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, NONE: 0 };
  rows.forEach(r => { if (r.severity in map) map[r.severity] = r.count; });
  return map;
}

function toAssessmentMap(rows) {
  const map = {};
  rows.forEach(r => { map[r.assessment] = r.count; });
  return map;
}

function getDashboardData(db, rawFilters) {
  const filters = parseFilters(rawFilters);
  return {
    kpis:                    repo.getKpis(db, filters),
    severity_distribution:   toSeverityMap(repo.getSeverityDistribution(db, filters)),
    cves_by_asset:           repo.getCvesByAsset(db, filters),
    cves_by_month:           repo.getCvesByMonth(db, filters),
    assessment_distribution: toAssessmentMap(repo.getAssessmentDistribution(db, filters)),
    ai_coverage:             repo.getAiCoverage(db, filters),
  };
}

function getAssetOptions(db) {
  return repo.getAssetOptions(db);
}

module.exports = { getDashboardData, getAssetOptions };
