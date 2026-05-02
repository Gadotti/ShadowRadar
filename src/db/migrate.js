'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { getDb } = require('./connection');

function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
  `);
}

function appliedMigrationNames(db) {
  return db
    .prepare('SELECT name FROM _migrations ORDER BY id')
    .all()
    .map((r) => r.name);
}

function loadMigrationFiles() {
  const dir = path.join(__dirname, 'migrations');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .sort()
    .map((f) => require(path.join(dir, f)));
}

function runMigrations(db) {
  ensureMigrationsTable(db);

  const applied = new Set(appliedMigrationNames(db));
  const files = loadMigrationFiles();
  let count = 0;

  for (const migration of files) {
    if (applied.has(migration.name)) {
      continue;
    }

    // Run each migration inside a transaction so a partial failure rolls back.
    db.transaction(() => {
      migration.up(db);
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration.name);
    })();

    console.log(`  applied: ${migration.name}`);
    count++;
  }

  if (count === 0) {
    console.log('  migrations: already up to date');
  }
}

// Allow running directly: `node src/db/migrate.js`
if (require.main === module) {
  console.log('Running migrations...');
  const db = getDb();
  runMigrations(db);
  console.log('Done.');
  process.exit(0);
}

module.exports = { runMigrations };
