'use strict';

const name = '003_ai_api_key_env';

function up(db) {
  db.exec(`DELETE FROM config WHERE key = 'ai.api_key'`);
  db.exec(`INSERT OR IGNORE INTO config (key, value) VALUES ('ai.api_key_env', '')`);
}

module.exports = { name, up };
