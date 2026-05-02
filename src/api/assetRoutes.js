'use strict';

const express = require('express');
const { getDb } = require('../db/connection');
const assetService = require('../services/assetService');
const authorize = require('../middleware/authorize');

const router = express.Router();

function handleError(res, err) {
  if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
  if (err.name === 'ConflictError') return res.status(409).json({ error: err.message });
  if (err.name === 'NotFoundError') return res.status(404).json({ error: err.message });
  return res.status(500).json({ error: 'Internal server error' });
}

router.get('/assets', (req, res) => {
  try {
    return res.json(assetService.listAssets(getDb(), req.query));
  } catch (err) {
    return handleError(res, err);
  }
});

router.get('/assets/:id', (req, res) => {
  try {
    return res.json(assetService.getAsset(getDb(), Number(req.params.id)));
  } catch (err) {
    return handleError(res, err);
  }
});

router.post('/assets', authorize('editor'), (req, res) => {
  try {
    return res.status(201).json(assetService.createAsset(getDb(), req.body || {}));
  } catch (err) {
    return handleError(res, err);
  }
});

router.put('/assets/:id', authorize('editor'), (req, res) => {
  try {
    return res.json(assetService.updateAsset(getDb(), Number(req.params.id), req.body || {}));
  } catch (err) {
    return handleError(res, err);
  }
});

router.delete('/assets/:id', authorize('editor'), (req, res) => {
  try {
    assetService.deleteAsset(getDb(), Number(req.params.id));
    return res.status(204).end();
  } catch (err) {
    return handleError(res, err);
  }
});

router.patch('/assets/:id/toggle', authorize('editor'), (req, res) => {
  try {
    return res.json(assetService.toggleActive(getDb(), Number(req.params.id)));
  } catch (err) {
    return handleError(res, err);
  }
});

module.exports = router;
