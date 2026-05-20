'use strict';

const configRepository = require('../repositories/configRepository');
const { ValidationError } = require('../models/errors');
const { encrypt } = require('../crypto');

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
  const source = configRepository.get(db, 'ai.api_key_source') || 'env_var';
  return {
    enabled:        (configRepository.get(db, 'ai.enabled') || 'false') === 'true',
    provider:       AI_PROVIDER,
    api_url:        configRepository.get(db, 'ai.api_url') || AI_BASE_URL,
    api_key_source: source,
    api_key_env:    configRepository.get(db, 'ai.api_key_env') || '',
    has_direct_key: Boolean(configRepository.get(db, 'ai.api_key_encrypted')),
    model:          configRepository.get(db, 'ai.model') || 'claude-sonnet-4-6',
    max_tokens:     parseInt(configRepository.get(db, 'ai.max_tokens') || '16000'),
    temperature:    parseFloat(configRepository.get(db, 'ai.temperature') || '0'),
    batch_size:     parseInt(configRepository.get(db, 'ai.batch_size') || '20'),
  };
}

function saveAiConfig(db, { enabled, api_url, api_key_source, api_key_env, api_key_direct, model, max_tokens, temperature, batch_size }) {
  const enabledBool = enabled === true || enabled === 'true';

  const resolvedUrl = api_url || AI_BASE_URL;
  try { new URL(resolvedUrl); } catch {
    throw new ValidationError('api_url must be a valid URL');
  }

  const source = api_key_source === 'direct' ? 'direct' : 'env_var';

  if (source === 'env_var') {
    const envVar = api_key_env || '';
    if (envVar && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(envVar)) {
      throw new ValidationError(`api_key_env must be a valid environment variable name, got: ${envVar}`);
    }
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
    'ai.enabled':        String(enabledBool),
    'ai.api_url':        resolvedUrl,
    'ai.api_key_source': source,
    'ai.api_key_env':    source === 'env_var' ? (api_key_env || '') : '',
    'ai.model':          model || 'claude-sonnet-4-6',
    'ai.max_tokens':     String(mt),
    'ai.temperature':    String(temp),
    'ai.batch_size':     String(bs),
  };

  if (source === 'direct') {
    const rawKey = (api_key_direct || '').trim();
    if (rawKey) {
      try {
        entries['ai.api_key_encrypted'] = encrypt(rawKey);
      } catch (err) {
        throw new ValidationError(`Falha ao criptografar a chave: ${err.message}`);
      }
    }
    // If rawKey is empty: keep existing encrypted key (no entry added = no overwrite)
  } else {
    // Switching to env_var clears any stored direct key
    entries['ai.api_key_encrypted'] = '';
  }

  configRepository.setMany(db, entries);
}

module.exports = { getNistConfig, saveNistConfig, getAiConfig, saveAiConfig };
