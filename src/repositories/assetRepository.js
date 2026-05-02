'use strict';

function findAll(db, { search = null, active = 'all', page = 1, pageSize = 20 } = {}) {
  const conditions = [];
  const params = [];

  if (search) {
    conditions.push('(a.name LIKE ? OR a.tag LIKE ? OR a.description LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  if (active !== 'all') {
    conditions.push('a.active = ?');
    params.push(Number(active));
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const { n: total } = db.prepare(`SELECT COUNT(*) AS n FROM assets a ${where}`).get(...params);

  const offset = (page - 1) * pageSize;
  const items = db.prepare(`
    SELECT a.*, COUNT(c.id) AS cve_count, MAX(c.scanned_at) AS last_scan
    FROM assets a
    LEFT JOIN asset_cves c ON c.asset_id = a.id
    ${where}
    GROUP BY a.id
    ORDER BY a.name, a.tag NULLS LAST
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  return { items, total };
}

function findById(db, id) {
  return db.prepare('SELECT * FROM assets WHERE id = ?').get(id);
}

function findByNameAndTag(db, name, tag) {
  if (!tag) return undefined;
  return db.prepare('SELECT * FROM assets WHERE name = ? AND tag = ?').get(name, tag);
}

function create(db, { name, tag, description, url, current_version, cve_start_date, active = 1 }) {
  const result = db.prepare(`
    INSERT INTO assets (name, tag, description, url, current_version, cve_start_date, active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name, tag ?? null, description ?? null, url ?? null, current_version, cve_start_date, active ? 1 : 0);
  return result.lastInsertRowid;
}

function update(db, id, { name, tag, description, url, current_version, cve_start_date, active }) {
  db.prepare(`
    UPDATE assets
    SET name=?, tag=?, description=?, url=?, current_version=?, cve_start_date=?, active=?,
        updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now')
    WHERE id=?
  `).run(name, tag ?? null, description ?? null, url ?? null, current_version, cve_start_date, active ? 1 : 0, id);
}

function remove(db, id) {
  db.prepare('DELETE FROM assets WHERE id = ?').run(id);
}

function setActive(db, id, active) {
  db.prepare(`
    UPDATE assets SET active=?, updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id=?
  `).run(active ? 1 : 0, id);
}

function getLastScanDate(db, id) {
  const row = db.prepare('SELECT MAX(scanned_at) AS last_scan FROM asset_cves WHERE asset_id = ?').get(id);
  return row ? row.last_scan : null;
}

function getCveCount(db, id) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM asset_cves WHERE asset_id = ?').get(id);
  return row ? row.n : 0;
}

module.exports = {
  findAll, findById, findByNameAndTag,
  create, update, remove, setActive,
  getLastScanDate, getCveCount,
};
