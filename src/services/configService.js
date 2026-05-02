'use strict';

const configRepository = require('../repositories/configRepository');
const { ValidationError } = require('../models/errors');

const NIST_SOURCE  = 'NIST NVD API';
const NIST_BASE_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const AI_PROVIDER  = 'Claude';
const AI_BASE_URL  = 'https://api.anthropic.com';

function getNistConfig(db) {
  return {
    source_name: NIST_SOURCE,
    base_url:    NIST_BASE_URL,
    page_size:   parseInt(configRepository.get(db, 'nist.page_size') || '50'),
    api_key:     '****',
    api_key_set: Boolean(configRepository.get(db, 'nist.api_key')),
  };
}

function saveNistConfig(db, { page_size, api_key }) {
  const ps = parseInt(page_size);
  if (isNaN(ps) || ps < 1 || ps > 2000) {
    throw new ValidationError('page_size must be an integer between 1 and 2000');
  }
  const entries = { 'nist.page_size': String(ps) };
  if (api_key && api_key !== '****') {
    entries['nist.api_key'] = api_key;
  }
  configRepository.setMany(db, entries);
}

function getAiConfig(db) {
  return {
    enabled:     (configRepository.get(db, 'ai.enabled') || 'false') === 'true',
    provider:    AI_PROVIDER,
    api_url:     configRepository.get(db, 'ai.api_url') || AI_BASE_URL,
    api_key:     '****',
    api_key_set: Boolean(configRepository.get(db, 'ai.api_key')),
    model:       configRepository.get(db, 'ai.model') || 'claude-sonnet-4-6',
    max_tokens:  parseInt(configRepository.get(db, 'ai.max_tokens') || '16000'),
    temperature: parseFloat(configRepository.get(db, 'ai.temperature') || '0'),
    batch_size:  parseInt(configRepository.get(db, 'ai.batch_size') || '20'),
  };
}

function saveAiConfig(db, { enabled, api_url, api_key, model, max_tokens, temperature, batch_size }) {
  const enabledBool = enabled === true || enabled === 'true';

  const resolvedUrl = api_url || AI_BASE_URL;
  try { new URL(resolvedUrl); } catch {
    throw new ValidationError('api_url must be a valid URL');
  }

  const mt = parseInt(max_tokens);
  if (isNaN(mt) || mt < 1) {
    throw new ValidationError('max_tokens must be a positive integer');
  }

  const temp = parseFloat(temperature);
  if (isNaN(temp) || temp < 0 || temp > 1) {
    throw new ValidationError('temperature must be between 0.0 and 1.0');
  }

  const bs = parseInt(batch_size);
  if (isNaN(bs) || bs < 1 || bs > 100) {
    throw new ValidationError('batch_size must be an integer between 1 and 100');
  }

  const entries = {
    'ai.enabled':     String(enabledBool),
    'ai.api_url':     resolvedUrl,
    'ai.model':       model || 'claude-sonnet-4-6',
    'ai.max_tokens':  String(mt),
    'ai.temperature': String(temp),
    'ai.batch_size':  String(bs),
  };
  if (api_key && api_key !== '****') {
    entries['ai.api_key'] = api_key;
  }
  configRepository.setMany(db, entries);
}

module.exports = { getNistConfig, saveNistConfig, getAiConfig, saveAiConfig };
