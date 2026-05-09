'use strict';

const name = '004_asset_scan_state';

// Adds two columns to support precise incremental scanning:
//   last_scanned_version  — current_version observed on the last successful scan.
//                            Lets the scanner detect a real version change vs. a
//                            cosmetic edit (description/url) that bumps updated_at.
//   last_scanned_pub_end  — pubEndDate sent to NVD on the last successful scan.
//                            Acts as the lower bound for the next incremental
//                            window, even when the asset returned zero CVEs and
//                            therefore has no row in asset_cves to derive it from.
function up(db) {
  db.exec(`
    ALTER TABLE assets ADD COLUMN last_scanned_version TEXT;
    ALTER TABLE assets ADD COLUMN last_scanned_pub_end TEXT;
  `);
}

module.exports = { name, up };
