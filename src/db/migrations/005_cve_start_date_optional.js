'use strict';

const name = '005_cve_start_date_optional';

// SQLite does not support ALTER COLUMN to drop NOT NULL, so we use the
// table-recreate pattern. defer_foreign_keys lets us drop the old `assets`
// without tripping the asset_cves FK — checks run again at commit time and
// pass because the renamed table holds the same rows.
function up(db) {
  db.exec(`
    PRAGMA defer_foreign_keys = ON;

    CREATE TABLE assets_new (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      name                 TEXT    NOT NULL,
      tag                  TEXT,
      description          TEXT,
      url                  TEXT,
      current_version      TEXT    NOT NULL,
      cve_start_date       TEXT,
      active               INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
      created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      updated_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      last_scanned_version TEXT,
      last_scanned_pub_end TEXT
    );

    INSERT INTO assets_new (
      id, name, tag, description, url, current_version, cve_start_date,
      active, created_at, updated_at, last_scanned_version, last_scanned_pub_end
    )
    SELECT
      id, name, tag, description, url, current_version, cve_start_date,
      active, created_at, updated_at, last_scanned_version, last_scanned_pub_end
    FROM assets;

    DROP TABLE assets;
    ALTER TABLE assets_new RENAME TO assets;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_name_tag
      ON assets(name, tag) WHERE tag IS NOT NULL;
  `);
}

module.exports = { name, up };
