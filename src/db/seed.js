'use strict';

require('dotenv').config();

const bcrypt = require('bcrypt');
const { getDb } = require('./connection');
const { runMigrations } = require('./migrate');

const BCRYPT_ROUNDS = 12;

const USERS = [
  { name: 'Administrador', username: 'admin',  password: 'admin123',  role: 'editor' },
  { name: 'Visualizador',  username: 'viewer', password: 'viewer123', role: 'reader' },
];

const ASSETS = [
  {
    name: 'FortiOS', tag: '#fw-01', description: 'Firewall principal',
    url: 'https://fw01.example.com', current_version: '7.4.11',
    cve_start_date: '2024-01-01',
  },
  {
    name: 'FortiOS', tag: '#fw-02', description: 'Firewall redundante',
    url: 'https://fw02.example.com', current_version: '7.4.10',
    cve_start_date: '2024-01-01',
  },
  {
    name: 'Nginx', tag: null, description: 'Servidor web de produção',
    url: 'https://app.example.com', current_version: '1.24.0',
    cve_start_date: '2023-06-01',
  },
];

const CONFIG_DEFAULTS = [
  { key: 'nist.page_size',    value: '50' },
  { key: 'nist.api_key',      value: '' },
  { key: 'ai.enabled',        value: 'false' },
  { key: 'ai.api_url',        value: 'https://api.anthropic.com' },
  { key: 'ai.api_key_env',    value: '' },
  { key: 'ai.model',          value: 'claude-sonnet-4-6' },
  { key: 'ai.max_tokens',     value: '16000' },
  { key: 'ai.temperature',    value: '0' },
  { key: 'ai.batch_size',     value: '20' },
  { key: 'scan.script_path',  value: './scripts/scan.py' },
];

async function seedUsers(db) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO users (name, username, password_hash, role)
    VALUES (@name, @username, @password_hash, @role)
  `);

  for (const u of USERS) {
    const hash = await bcrypt.hash(u.password, BCRYPT_ROUNDS);
    const result = insert.run({ name: u.name, username: u.username, password_hash: hash, role: u.role });
    if (result.changes > 0) {
      console.log(`  user created: ${u.username} (${u.role})`);
    } else {
      console.log(`  user skipped (already exists): ${u.username}`);
    }
  }
}

function seedAssets(db) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO assets (name, tag, description, url, current_version, cve_start_date)
    VALUES (@name, @tag, @description, @url, @current_version, @cve_start_date)
  `);

  for (const a of ASSETS) {
    const result = insert.run(a);
    const label = a.tag ? `${a.name} ${a.tag}` : a.name;
    if (result.changes > 0) {
      console.log(`  asset created: ${label}`);
    } else {
      console.log(`  asset skipped (already exists): ${label}`);
    }
  }
}

function seedConfig(db) {
  const upsert = db.prepare(`
    INSERT INTO config (key, value) VALUES (@key, @value)
    ON CONFLICT(key) DO NOTHING
  `);

  let count = 0;
  for (const entry of CONFIG_DEFAULTS) {
    const result = upsert.run(entry);
    if (result.changes > 0) count++;
  }
  console.log(`  config: ${count} default(s) inserted`);
}

async function seed() {
  const db = getDb();
  runMigrations(db);

  console.log('Seeding users...');
  await seedUsers(db);

  console.log('Seeding assets...');
  seedAssets(db);

  console.log('Seeding config...');
  seedConfig(db);

  console.log('Seed complete.');
}

seed().then(() => process.exit(0)).catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
