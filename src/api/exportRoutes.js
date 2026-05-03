'use strict';

const express = require('express');
const { getDb } = require('../db/connection');
const authenticate = require('../middleware/authenticate');
const authenticateApiKey = require('../middleware/authenticateApiKey');

const router = express.Router();

// Accept either JWT cookie or X-API-Key header
function authAny(req, res, next) {
  if (req.headers['x-api-key']) return authenticateApiKey(req, res, next);
  return authenticate(req, res, next);
}

const RISK_ORDER = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, NONE: 1 };
const RISK_LABEL = { 5: 'Critical', 4: 'High', 3: 'Medium', 2: 'Low', 1: 'None', 0: 'None' };
const ALERT_LABEL = {
  Critical:  'Immediate action required',
  High:      'Action required',
  Medium:    'Review recommended',
  Low:       'No immediate action required',
  None:      'No known vulnerabilities',
};
const EXCLUDED_ASSESSMENTS = new Set(['Not Affected', 'False Positive']);

function computeRisk(cves) {
  let max = 0;
  for (const c of cves) {
    if (EXCLUDED_ASSESSMENTS.has(c.user_assessment)) continue;
    const level = RISK_ORDER[c.severity] || 0;
    if (level > max) max = level;
  }
  return RISK_LABEL[max] || 'None';
}

function buildAssetId(name, version) {
  return `${name}_${version}`.replace(/\s+/g, '_');
}

router.get('/', authAny, (req, res) => {
  const db = getDb();
  const { asset_id, severity, active_only = 'true' } = req.query;

  const severities = severity ? severity.split(',').map(s => s.trim()).filter(Boolean) : [];
  const onlyActive = active_only !== 'false';

  // last completed scan
  const scanRow = db.prepare(
    "SELECT finished_at AS last_scan FROM scan_runs WHERE status='completed' ORDER BY finished_at DESC LIMIT 1"
  ).get();
  const lastScan = scanRow?.last_scan || null;

  // Build assets query
  const assetConds = [];
  const assetParams = [];
  if (onlyActive) { assetConds.push('a.active = 1'); }
  if (asset_id)   { assetConds.push('a.id = ?'); assetParams.push(Number(asset_id)); }
  const assetWhere = assetConds.length ? 'WHERE ' + assetConds.join(' AND ') : '';

  const assets = db.prepare(`SELECT * FROM assets a ${assetWhere} ORDER BY a.name`).all(...assetParams);

  // Build CVEs query per asset
  const cveConds = ['ac.asset_id = ?'];
  const cveBaseParams = [];
  if (severities.length) {
    cveConds.push(`ac.severity IN (${severities.map(() => '?').join(',')})`);
    cveBaseParams.push(...severities);
  }
  const cveWhere = 'WHERE ' + cveConds.join(' AND ');
  const cveStmt = db.prepare(`
    SELECT ac.cve_id, ac.description, ac.severity, ac.published_at, ac.user_assessment, ac.ai_assessment, ac.scanned_at
    FROM asset_cves ac ${cveWhere}
    ORDER BY ac.published_at DESC
  `);

  const reportItems = assets.map(a => {
    const cves = cveStmt.all(a.id, ...cveBaseParams);
    const risk = computeRisk(cves);

    const pubEndDate = cves.reduce((max, c) => {
      if (!c.scanned_at) return max;
      const d = c.scanned_at.slice(0, 10);
      return d > max ? d : max;
    }, '');

    return {
      id:                buildAssetId(a.name, a.current_version),
      name:              a.name,
      url:               a.url || '',
      current_version:   a.current_version,
      pubEndDate_checked: pubEndDate || null,
      cves: cves.map(c => ({
        cve_id:               c.cve_id,
        description:          c.description || '',
        severity:             c.severity,
        published_date:       c.published_at ? c.published_at.slice(0, 10) : null,
        assessment:           c.user_assessment || '',
        claude_ai_assessment: c.ai_assessment  || '',
      })),
      risk,
      alert: ALERT_LABEL[risk] || ALERT_LABEL.None,
    };
  });

  // Sort report_items by risk descending
  const riskToNum = { Critical: 5, High: 4, Medium: 3, Low: 2, None: 1 };
  reportItems.sort((a, b) => (riskToNum[b.risk] || 0) - (riskToNum[a.risk] || 0));

  return res.json({ last_scan: lastScan, report_items: reportItems });
});

module.exports = router;
