'use strict';

const name = '006_ai_api_key_direct';

function up(db) {
  db.prepare(`
    INSERT INTO config (key, value)
    VALUES ('ai.api_key_source', 'env_var')
    ON CONFLICT(key) DO NOTHING
  `).run();

  db.prepare(`
    INSERT INTO config (key, value)
    VALUES ('ai.api_key_encrypted', '')
    ON CONFLICT(key) DO NOTHING
  `).run();
}

module.exports = { name, up };
