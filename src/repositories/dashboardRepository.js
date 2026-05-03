'use strict';

function buildCveJoin({ asset_ids = [], published_after = null, published_before = null, severity = [] } = {}) {
  const conditions = ['a.active = 1'];
  const params = [];

  if (asset_ids.length) {
    conditions.push(`ac.asset_id IN (${asset_ids.map(() => '?').join(',')})`);
    params.push(...asset_ids);
  }
  if (published_after)  { conditions.push('ac.published_at >= ?'); params.push(published_after); }
  if (published_before) { conditions.push('ac.published_at <= ?'); params.push(published_before); }
  if (severity.length) {
    conditions.push(`ac.severity IN (${severity.map(() => '?').join(',')})`);
    params.push(...severity);
  }

  return { where: 'WHERE ' + conditions.join(' AND '), params };
}

function getKpis(db, filters = {}) {
  const { asset_ids = [] } = filters;

  const assetCond = asset_ids.length
    ? `AND a.id IN (${asset_ids.map(() => '?').join(',')})` : '';

  const activeAssets = db.prepare(
    `SELECT COUNT(*) AS n FROM assets a WHERE a.active = 1 ${assetCond}`
  ).get(...asset_ids).n;

  const { where, params } = buildCveJoin(filters);
  const base = `FROM asset_cves ac JOIN assets a ON a.id = ac.asset_id ${where}`;

  const totalCves             = db.prepare(`SELECT COUNT(*) AS n ${base}`).get(...params).n;
  const cvesPending           = db.prepare(`SELECT COUNT(*) AS n ${base} AND ac.user_assessment IS NULL`).get(...params).n;
  const cvesMitigating        = db.prepare(`SELECT COUNT(*) AS n ${base} AND ac.user_assessment = 'Acknowledge/Mitigating'`).get(...params).n;

  return {
    active_assets:           activeAssets,
    total_cves:              totalCves,
    cves_pending_assessment: cvesPending,
    cves_mitigating:         cvesMitigating,
  };
}

function getSeverityDistribution(db, filters = {}) {
  const { where, params } = buildCveJoin(filters);
  return db.prepare(`
    SELECT ac.severity, COUNT(*) AS count
    FROM asset_cves ac JOIN assets a ON a.id = ac.asset_id ${where}
    GROUP BY ac.severity
  `).all(...params);
}

function getCvesByAsset(db, filters = {}) {
  const { where, params } = buildCveJoin(filters);
  return db.prepare(`
    SELECT a.id AS asset_id, a.name AS asset_name, a.tag AS asset_tag, COUNT(*) AS total
    FROM asset_cves ac JOIN assets a ON a.id = ac.asset_id ${where}
    GROUP BY a.id
    ORDER BY total DESC
    LIMIT 10
  `).all(...params);
}

function getCvesByMonth(db, filters = {}) {
  const { where, params } = buildCveJoin(filters);
  return db.prepare(`
    SELECT strftime('%Y-%m', ac.published_at) AS month, COUNT(*) AS count
    FROM asset_cves ac JOIN assets a ON a.id = ac.asset_id ${where}
      AND ac.published_at IS NOT NULL
    GROUP BY month
    ORDER BY month
  `).all(...params);
}

function getAssessmentDistribution(db, filters = {}) {
  const { where, params } = buildCveJoin(filters);
  return db.prepare(`
    SELECT COALESCE(ac.user_assessment, 'Pending') AS assessment, COUNT(*) AS count
    FROM asset_cves ac JOIN assets a ON a.id = ac.asset_id ${where}
    GROUP BY assessment
  `).all(...params);
}

function getAiCoverage(db, filters = {}) {
  const { where, params } = buildCveJoin(filters);
  const total  = db.prepare(`SELECT COUNT(*) AS n FROM asset_cves ac JOIN assets a ON a.id = ac.asset_id ${where}`).get(...params).n;
  const withAi = db.prepare(`SELECT COUNT(*) AS n FROM asset_cves ac JOIN assets a ON a.id = ac.asset_id ${where} AND ac.ai_assessment IS NOT NULL`).get(...params).n;
  return { total, with_ai: withAi, percentage: total > 0 ? Math.round((withAi / total) * 1000) / 10 : 0 };
}

function getAssetOptions(db) {
  return db.prepare('SELECT id, name, tag FROM assets WHERE active = 1 ORDER BY name').all();
}

module.exports = { getKpis, getSeverityDistribution, getCvesByAsset, getCvesByMonth, getAssessmentDistribution, getAiCoverage, getAssetOptions };
