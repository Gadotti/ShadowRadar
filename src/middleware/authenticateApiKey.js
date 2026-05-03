'use strict';

const { getDb } = require('../db/connection');
const apiKeyService = require('../services/apiKeyService');
const apiKeyRepository = require('../repositories/apiKeyRepository');

function authenticateApiKey(req, res, next) {
  const plain = req.headers['x-api-key'];
  if (!plain) return res.status(401).json({ error: 'X-API-Key header required' });

  const record = apiKeyService.validateKey(getDb(), plain);
  if (!record) return res.status(401).json({ error: 'Invalid API key' });

  apiKeyRepository.updateLastUsed(getDb(), record.id);
  req.apiKey = record;
  return next();
}

module.exports = authenticateApiKey;
