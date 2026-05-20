'use strict';

const configService = require('../../../src/services/configService');
const { ValidationError } = require('../../../src/models/errors');
const { makeDb, seedConfig } = require('../../helpers/db');

describe('configService', () => {
  let db;
  beforeEach(() => {
    db = makeDb();
    seedConfig(db);
  });

  describe('getNistConfig', () => {
    test('returns masked api_key and api_key_set=false when empty', () => {
      const cfg = configService.getNistConfig(db);
      expect(cfg.api_key).toBe('****');
      expect(cfg.api_key_set).toBe(false);
      expect(typeof cfg.page_size).toBe('number');
      expect(cfg.source_name).toBeTruthy();
      expect(cfg.base_url).toBeTruthy();
    });

    test('api_key_set is true after a key is saved', () => {
      configService.saveNistConfig(db, { page_size: '50', api_key: 'real-key-value' });
      const cfg = configService.getNistConfig(db);
      expect(cfg.api_key_set).toBe(true);
      expect(cfg.api_key).toBe('****');
    });
  });

  describe('saveNistConfig', () => {
    test('saves valid page_size', () => {
      configService.saveNistConfig(db, { page_size: '100' });
      const cfg = configService.getNistConfig(db);
      expect(cfg.page_size).toBe(100);
    });

    test('does not overwrite api_key when masked value sent', () => {
      configService.saveNistConfig(db, { page_size: '50', api_key: 'real-key' });
      configService.saveNistConfig(db, { page_size: '50', api_key: '****' });
      const cfg = configService.getNistConfig(db);
      expect(cfg.api_key_set).toBe(true);
    });

    test('throws ValidationError for page_size = 0', () => {
      expect(() => configService.saveNistConfig(db, { page_size: '0' })).toThrow(ValidationError);
    });

    test('throws ValidationError for page_size > 2000', () => {
      expect(() => configService.saveNistConfig(db, { page_size: '2001' })).toThrow(ValidationError);
    });

    test('throws ValidationError for non-numeric page_size', () => {
      expect(() => configService.saveNistConfig(db, { page_size: 'abc' })).toThrow(ValidationError);
    });
  });

  describe('getAiConfig', () => {
    test('returns boolean enabled and api_key_env string', () => {
      const cfg = configService.getAiConfig(db);
      expect(typeof cfg.enabled).toBe('boolean');
      expect(typeof cfg.api_key_env).toBe('string');
      expect(cfg.model).toBeTruthy();
      expect(typeof cfg.max_tokens).toBe('number');
    });

    test('returns api_key_source and has_direct_key fields', () => {
      const cfg = configService.getAiConfig(db);
      expect(cfg.api_key_source).toBe('env_var');
      expect(typeof cfg.has_direct_key).toBe('boolean');
    });
  });

  describe('saveAiConfig', () => {
    const validCfg = {
      enabled: true,
      api_url: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-6',
      max_tokens: '1000',
      temperature: '0.5',
      batch_size: '10',
    };

    test('saves valid config and reads back correctly', () => {
      configService.saveAiConfig(db, validCfg);
      const cfg = configService.getAiConfig(db);
      expect(cfg.enabled).toBe(true);
      expect(cfg.max_tokens).toBe(1000);
      expect(cfg.temperature).toBe(0.5);
      expect(cfg.batch_size).toBe(10);
    });

    test('saves api_key_env and reads back correctly', () => {
      configService.saveAiConfig(db, { ...validCfg, api_key_env: 'ANTHROPIC_API_KEY' });
      const cfg = configService.getAiConfig(db);
      expect(cfg.api_key_env).toBe('ANTHROPIC_API_KEY');
    });

    test('allows empty api_key_env', () => {
      configService.saveAiConfig(db, { ...validCfg, api_key_env: '' });
      const cfg = configService.getAiConfig(db);
      expect(cfg.api_key_env).toBe('');
    });

    test('throws ValidationError for invalid env var name', () => {
      expect(() => configService.saveAiConfig(db, { ...validCfg, api_key_env: '123_INVALID' }))
        .toThrow(ValidationError);
    });

    test('throws ValidationError for invalid api_url', () => {
      expect(() => configService.saveAiConfig(db, { ...validCfg, api_url: 'not-a-url' }))
        .toThrow(ValidationError);
    });

    test('throws ValidationError for max_tokens < 1', () => {
      expect(() => configService.saveAiConfig(db, { ...validCfg, max_tokens: '0' }))
        .toThrow(ValidationError);
    });

    test('throws ValidationError for temperature > 1', () => {
      expect(() => configService.saveAiConfig(db, { ...validCfg, temperature: '1.5' }))
        .toThrow(ValidationError);
    });

    test('throws ValidationError for temperature < 0', () => {
      expect(() => configService.saveAiConfig(db, { ...validCfg, temperature: '-0.1' }))
        .toThrow(ValidationError);
    });

    test('throws ValidationError for batch_size > 100', () => {
      expect(() => configService.saveAiConfig(db, { ...validCfg, batch_size: '101' }))
        .toThrow(ValidationError);
    });

    test('saves api_key_source=env_var and clears encrypted key', () => {
      configService.saveAiConfig(db, { ...validCfg, api_key_source: 'env_var', api_key_env: 'MY_KEY' });
      const cfg = configService.getAiConfig(db);
      expect(cfg.api_key_source).toBe('env_var');
      expect(cfg.api_key_env).toBe('MY_KEY');
      expect(cfg.has_direct_key).toBe(false);
    });

    test('saves api_key_source=direct with encrypted key', () => {
      process.env.ENCRYPTION_KEY = require('crypto').randomBytes(32).toString('hex');
      configService.saveAiConfig(db, { ...validCfg, api_key_source: 'direct', api_key_direct: 'sk-test-key' });
      const cfg = configService.getAiConfig(db);
      expect(cfg.api_key_source).toBe('direct');
      expect(cfg.has_direct_key).toBe(true);
      expect(cfg.api_key_env).toBe('');
      delete process.env.ENCRYPTION_KEY;
    });

    test('keeps existing encrypted key when direct key not provided on save', () => {
      process.env.ENCRYPTION_KEY = require('crypto').randomBytes(32).toString('hex');
      configService.saveAiConfig(db, { ...validCfg, api_key_source: 'direct', api_key_direct: 'sk-original' });
      configService.saveAiConfig(db, { ...validCfg, api_key_source: 'direct' });
      const cfg = configService.getAiConfig(db);
      expect(cfg.has_direct_key).toBe(true);
      delete process.env.ENCRYPTION_KEY;
    });

    test('throws ValidationError when ENCRYPTION_KEY missing for direct key', () => {
      delete process.env.ENCRYPTION_KEY;
      expect(() =>
        configService.saveAiConfig(db, { ...validCfg, api_key_source: 'direct', api_key_direct: 'sk-test' })
      ).toThrow(ValidationError);
    });

    test('switching to env_var clears stored encrypted key', () => {
      process.env.ENCRYPTION_KEY = require('crypto').randomBytes(32).toString('hex');
      configService.saveAiConfig(db, { ...validCfg, api_key_source: 'direct', api_key_direct: 'sk-test' });
      configService.saveAiConfig(db, { ...validCfg, api_key_source: 'env_var', api_key_env: 'MY_ENV' });
      const cfg = configService.getAiConfig(db);
      expect(cfg.api_key_source).toBe('env_var');
      expect(cfg.has_direct_key).toBe(false);
      delete process.env.ENCRYPTION_KEY;
    });
  });
});
