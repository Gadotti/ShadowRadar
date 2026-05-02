'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let instance = null;

function openDatabase() {
  const dbPath = process.env.DB_PATH || './data/shadowradar.db';
  const resolved = path.resolve(dbPath);

  fs.mkdirSync(path.dirname(resolved), { recursive: true });

  const db = new Database(resolved);

  // WAL mode allows scan.py and the Node.js server to write concurrently
  // without corruption — writers queue instead of blocking readers.
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  // SQLite does not enforce FK constraints by default; this must be set per connection.
  db.pragma('foreign_keys = ON');

  return db;
}

function getDb() {
  if (!instance) {
    instance = openDatabase();
  }
  return instance;
}

module.exports = { getDb };
