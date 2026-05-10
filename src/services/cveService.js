'use strict';

const cveRepository = require('../repositories/cveRepository');
const { ValidationError, NotFoundError } = require('../models/errors');

const VALID_ASSESSMENTS = ['Acknowledge/Mitigating', 'Accepted Risk', 'Not Affected', 'False Positive'];

const RISK_LABEL = { 5: 'CRITICAL', 4: 'HIGH', 3: 'MEDIUM', 2: 'LOW', 1: 'NONE', 0: 'NONE' };
const ALERT_LABEL = {
  CRITICAL: 'Immediate action required',
  HIGH:     'Action required',
  MEDIUM:   'Review recommended',
  LOW:      'No immediate action required',
  NONE:     'No known vulnerabilities',
};

function parseFilters(raw) {
  return {
    asset_id:          raw.asset_id ? Number(raw.asset_id) : null,
    search:            raw.search   || null,
    severity:          raw.severity ? raw.severity.split(',').map(s => s.trim()).filter(Boolean) : [],
    user_assessment:   raw.user_assessment ? raw.user_assessment.split(',').map(s => s.trim()).filter(Boolean) : [],
    has_ai_assessment: raw.has_ai_assessment === 'true' ? true : raw.has_ai_assessment === 'false' ? false : null,
    published_after:   raw.published_after  || null,
    published_before:  raw.published_before || null,
    active_assets_only: raw.active_assets_only === 'true',
    page:      Math.max(1, parseInt(raw.page)      || 1),
    page_size: Math.min(100, Math.max(1, parseInt(raw.page_size) || 50)),
    order_by:  raw.order_by  || 'cvss_score',
    order_dir: raw.order_dir === 'ASC' ? 'ASC' : 'DESC',
  };
}

function listCves(db, rawFilters) {
  const filters = parseFilters(rawFilters);
  const { items, total } = cveRepository.findAll(db, filters);
  const { last_completed_at } = cveRepository.getLastScanInfo(db);
  return { items, total, page: filters.page, page_size: filters.page_size, last_scan: last_completed_at };
}

function getMacroView(db, rawFilters) {
  const rows = cveRepository.getMacroView(db, {
    asset_id:          rawFilters.asset_id ? Number(rawFilters.asset_id) : null,
    active_assets_only: rawFilters.active_assets_only === 'true',
  });
  const { last_completed_at } = cveRepository.getLastScanInfo(db);
  return {
    rows: rows.map(row => {
      const risk = RISK_LABEL[Math.min(row.risk_level, 5)] || 'NONE';
      return { ...row, risk, alert: ALERT_LABEL[risk] };
    }),
    last_scan: last_completed_at,
  };
}

function updateAssessment(db, id, { user_assessment, user_notes }) {
  if (user_assessment !== null && user_assessment !== undefined) {
    if (!VALID_ASSESSMENTS.includes(user_assessment)) {
      throw new ValidationError(`Invalid user_assessment: "${user_assessment}". Valid values: ${VALID_ASSESSMENTS.join(', ')}`);
    }
  }
  const cve = cveRepository.findById(db, id);
  if (!cve) throw new NotFoundError('CVE not found');
  cveRepository.updateAssessment(db, id, {
    user_assessment: user_assessment ?? null,
    user_notes:      user_notes      ?? null,
  });
  return cveRepository.findById(db, id);
}

module.exports = { listCves, getMacroView, updateAssessment };
