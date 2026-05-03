'use strict';

const express = require('express');
const { getDb } = require('../db/connection');
const apiKeyService = require('../services/apiKeyService');
const apiKeyRepository = require('../repositories/apiKeyRepository');
const authorize = require('../middleware/authorize');

const router = express.Router();

router.use(authorize('editor'));

router.get('/', (req, res) => {
  return res.json(apiKeyRepository.listAll(getDb()));
});

router.post('/', (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });

  const { id, plainKey, created_at } = apiKeyService.createApiKey(getDb(), name);
  return res.status(201).json({
    id,
    name,
    key: plainKey,
    created_at,
    warning: 'Guarde esta chave. Ela não será exibida novamente.',
  });
});

router.delete('/:id', (req, res) => {
  apiKeyRepository.remove(getDb(), Number(req.params.id));
  return res.status(204).end();
});

module.exports = router;
