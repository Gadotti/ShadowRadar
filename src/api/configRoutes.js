'use strict';

const express = require('express');
const { getDb } = require('../db/connection');
const configService = require('../services/configService');
const authorize = require('../middleware/authorize');

const router = express.Router();

function handleError(res, err) {
  if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
  return res.status(500).json({ error: 'Internal server error' });
}

router.get('/nist', authorize('editor'), (req, res) => {
  try {
    return res.json(configService.getNistConfig(getDb()));
  } catch (err) {
    return handleError(res, err);
  }
});

router.put('/nist', authorize('editor'), (req, res) => {
  try {
    configService.saveNistConfig(getDb(), req.body || {});
    return res.json(configService.getNistConfig(getDb()));
  } catch (err) {
    return handleError(res, err);
  }
});

router.get('/ai', authorize('editor'), (req, res) => {
  try {
    return res.json(configService.getAiConfig(getDb()));
  } catch (err) {
    return handleError(res, err);
  }
});

router.put('/ai', authorize('editor'), (req, res) => {
  try {
    configService.saveAiConfig(getDb(), req.body || {});
    return res.json(configService.getAiConfig(getDb()));
  } catch (err) {
    return handleError(res, err);
  }
});

module.exports = router;
