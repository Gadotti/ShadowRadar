'use strict';

const express = require('express');
const { getDb } = require('../db/connection');
const cveService = require('../services/cveService');
const cveRepository = require('../repositories/cveRepository');
const authorize = require('../middleware/authorize');

const router = express.Router();

function handleError(res, err) {
  if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
  if (err.name === 'NotFoundError')   return res.status(404).json({ error: err.message });
  return res.status(500).json({ error: 'Internal server error' });
}

router.get('/', (req, res) => {
  try {
    return res.json(cveService.listCves(getDb(), req.query));
  } catch (err) {
    return handleError(res, err);
  }
});

router.get('/macro', (req, res) => {
  try {
    return res.json(cveService.getMacroView(getDb(), req.query));
  } catch (err) {
    return handleError(res, err);
  }
});

router.get('/:id', (req, res) => {
  try {
    const cve = cveRepository.findById(getDb(), Number(req.params.id));
    if (!cve) return res.status(404).json({ error: 'CVE not found' });
    return res.json(cve);
  } catch (err) {
    return handleError(res, err);
  }
});

router.put('/:id/assessment', authorize('editor'), (req, res) => {
  try {
    const updated = cveService.updateAssessment(getDb(), Number(req.params.id), req.body || {});
    return res.json(updated);
  } catch (err) {
    return handleError(res, err);
  }
});

module.exports = router;
