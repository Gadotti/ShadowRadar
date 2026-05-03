'use strict';

const crypto = require('crypto');
const repo = require('../repositories/apiKeyRepository');

const PREFIX = 'sr_';

function generateKey() {
  return PREFIX + crypto.randomBytes(20).toString('hex');
}

function hashKey(plainKey) {
  return crypto.createHash('sha256').update(plainKey).digest('hex');
}

function createApiKey(db, name) {
  const plainKey = generateKey();
  const keyHash = hashKey(plainKey);
  const id = repo.create(db, { name, keyHash });
  const row = repo.findByHash(db, keyHash);
  return { id, name, plainKey, created_at: row.created_at };
}

function validateKey(db, plainKey) {
  if (!plainKey) return null;
  const keyHash = hashKey(plainKey);
  return repo.findByHash(db, keyHash) || null;
}

module.exports = { generateKey, hashKey, createApiKey, validateKey };
