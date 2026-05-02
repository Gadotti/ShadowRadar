'use strict';

const express = require('express');
const { getDb } = require('../db/connection');
const scanService = require('../services/scanService');
const scanRepository = require('../repositories/scanRepository');
const authorize = require('../middleware/authorize');

const router = express.Router();

router.post('/run', authorize('editor'), (req, res) => {
  try {
    const result = scanService.startScan(getDb(), req.body || {});
    return res.status(202).json(result);
  } catch (err) {
    if (err.name === 'ConflictError') return res.status(409).json({ error: err.message });
    if (err.name === 'NotFoundError') return res.status(500).json({ error: err.message });
    return res.status(500).json({ error: 'Failed to start scan' });
  }
});

router.get('/status', authorize('editor'), (req, res) => {
  return res.json(scanService.getCurrentStatus(getDb()));
});

router.post('/cancel', authorize('editor'), (req, res) => {
  try {
    scanService.cancelScan(getDb());
    return res.json({ ok: true });
  } catch (err) {
    if (err.name === 'ConflictError') return res.status(409).json({ error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/history', authorize('editor'), (req, res) => {
  const runs = scanRepository.listRuns(getDb(), 20);
  const runsWithDuration = runs.map(r => ({
    ...r,
    duration_seconds: durationSeconds(r.started_at, r.finished_at),
  }));
  return res.json({ runs: runsWithDuration });
});

function durationSeconds(start, end) {
  if (!start || !end) return null;
  const parse = s => new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  const diff = parse(end) - parse(start);
  return diff < 0 ? null : Math.round(diff / 1000);
}

module.exports = router;
