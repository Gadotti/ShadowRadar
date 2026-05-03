'use strict';

const VALID_ORDER_COLS = new Set([
  'cve_id', 'severity', 'cvss_score', 'published_at', 'scanned_at', 'user_assessment', 'asset_name',
]);

function findAll(db, {
  asset_id = null,
  search = null,
  severity = [],
  user_assessment = [],
  has_ai_assessment = null,
  published_after = null,
  published_before = null,
  active_assets_only = false,
  page = 1,
  page_size = 50,
  order_by = 'cvss_score',
  order_dir = 'DESC',
} = {}) {
  const conditions = [];
  const params = [];

  if (asset_id)            { conditions.push('ac.asset_id = ?');          params.push(asset_id); }
  if (active_assets_only)  { conditions.push('a.active = 1'); }
  if (search) {
    conditions.push('(ac.cve_id LIKE ? OR ac.description LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like);
  }
  if (severity.length)     buildInClause('ac.severity',        severity,        false, conditions, params);
  if (user_assessment.length) buildAssessmentClause(user_assessment, conditions, params);
  if (has_ai_assessment === true)  { conditions.push('ac.ai_assessment IS NOT NULL'); }
  if (has_ai_assessment === false) { conditions.push('ac.ai_assessment IS NULL'); }
  if (published_after)  { conditions.push('ac.published_at >= ?'); params.push(published_after); }
  if (published_before) { conditions.push('ac.published_at <= ?'); params.push(published_before); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const { n: total } = db.prepare(`
    SELECT COUNT(*) AS n
    FROM asset_cves ac JOIN assets a ON a.id = ac.asset_id ${where}
  `).get(...params);

  const col = VALID_ORDER_COLS.has(order_by) ? order_by : 'cvss_score';
  const dir = order_dir === 'ASC' ? 'ASC' : 'DESC';
  const orderSql = col === 'severity'
    ? `CASE ac.severity WHEN 'CRITICAL' THEN 5 WHEN 'HIGH' THEN 4 WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 2 ELSE 1 END ${dir}`
    : col === 'asset_name'
      ? `a.name ${dir}`
      : `ac.${col} ${dir}`;

  const offset = (page - 1) * page_size;
  const items = db.prepare(`
    SELECT ac.*, a.name AS asset_name, a.tag AS asset_tag, a.current_version AS asset_version
    FROM asset_cves ac JOIN assets a ON a.id = ac.asset_id
    ${where}
    ORDER BY ${orderSql}
    LIMIT ? OFFSET ?
  `).all(...params, page_size, offset);

  return { items, total };
}

function buildInClause(col, values, treatNullAs, conditions, params) {
  conditions.push(`${col} IN (${values.map(() => '?').join(',')})`);
  params.push(...values);
}

function buildAssessmentClause(values, conditions, params) {
  const pending = values.includes('PENDING');
  const rest = values.filter(v => v !== 'PENDING');

  if (pending && rest.length) {
    conditions.push(`(ac.user_assessment IS NULL OR ac.user_assessment IN (${rest.map(() => '?').join(',')}))`);
    params.push(...rest);
  } else if (rest.length) {
    conditions.push(`ac.user_assessment IN (${rest.map(() => '?').join(',')})`);
    params.push(...rest);
  } else if (pending) {
    conditions.push('ac.user_assessment IS NULL');
  }
}

function getMacroView(db, { asset_id = null, active_assets_only = false } = {}) {
  const conditions = [];
  const params = [];

  if (asset_id)           { conditions.push('a.id = ?'); params.push(asset_id); }
  if (active_assets_only) { conditions.push('a.active = 1'); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  return db.prepare(`
    SELECT
      a.id   AS asset_id,
      a.name AS asset_name,
      a.tag  AS asset_tag,
      a.current_version AS asset_version,
      MAX(ac.scanned_at) AS last_scan,
      COUNT(ac.id) AS total,
      COUNT(CASE WHEN ac.severity='CRITICAL' THEN 1 END) AS critical,
      COUNT(CASE WHEN ac.severity='HIGH'     THEN 1 END) AS high,
      COUNT(CASE WHEN ac.severity='MEDIUM'   THEN 1 END) AS medium,
      COUNT(CASE WHEN ac.severity='LOW'      THEN 1 END) AS low,
      COUNT(CASE WHEN ac.severity='NONE'     THEN 1 END) AS none,
      COUNT(CASE WHEN ac.user_assessment IS NULL THEN 1 END) AS pending,
      COALESCE(MAX(CASE
        WHEN ac.user_assessment IN ('Not Affected','False Positive') THEN 0
        WHEN ac.severity='CRITICAL' THEN 5
        WHEN ac.severity='HIGH'     THEN 4
        WHEN ac.severity='MEDIUM'   THEN 3
        WHEN ac.severity='LOW'      THEN 2
        WHEN ac.severity='NONE'     THEN 1
        ELSE 0
      END), 0) AS risk_level
    FROM assets a
    LEFT JOIN asset_cves ac ON ac.asset_id = a.id
    ${where}
    GROUP BY a.id
    ORDER BY risk_level DESC, a.name
  `).all(...params);
}

function findById(db, id) {
  return db.prepare(`
    SELECT ac.*, a.name AS asset_name, a.tag AS asset_tag, a.current_version AS asset_version
    FROM asset_cves ac JOIN assets a ON a.id = ac.asset_id
    WHERE ac.id = ?
  `).get(id);
}

function updateAssessment(db, id, { user_assessment, user_notes }) {
  db.prepare(`
    UPDATE asset_cves
    SET user_assessment=?, user_notes=?, evaluated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now')
    WHERE id=?
  `).run(user_assessment, user_notes, id);
}

function getLastScanInfo(db) {
  const row = db.prepare(
    "SELECT finished_at AS last_completed_at FROM scan_runs WHERE status='completed' ORDER BY finished_at DESC LIMIT 1"
  ).get();
  return { last_completed_at: row?.last_completed_at || null };
}

module.exports = { findAll, getMacroView, findById, updateAssessment, getLastScanInfo };
