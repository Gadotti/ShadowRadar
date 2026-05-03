'use strict';

const express = require('express');
const { getDb } = require('../db/connection');
const dashboardService = require('../services/dashboardService');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    return res.json(dashboardService.getDashboardData(getDb(), req.query));
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/assets', (req, res) => {
  try {
    return res.json(dashboardService.getAssetOptions(getDb()));
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
