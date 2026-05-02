'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');

const { getDb } = require('./db/connection');
const { runMigrations } = require('./db/migrate');
const authenticate = require('./middleware/authenticate');
const authRoutes = require('./api/authRoutes');

const PORT = process.env.PORT || 3500;
const { version } = require('../package.json');

function buildApp() {
  const app = express();

  app.use(helmet());
  app.use(cookieParser());
  app.use(express.json());

  // Serve frontend static files
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Public routes — no authentication required
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', version }));
  app.use('/api/auth', authRoutes);

  // All subsequent /api/* routes require a valid JWT cookie
  app.use('/api', authenticate);

  app.use('/api', require('./api/assetRoutes'));
  app.use('/api/config', require('./api/configRoutes'));
  app.use('/api/scan',   require('./api/scanRoutes'));

  // Fallback: serve index.html for any non-API route (SPA hash routing)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  return app;
}

function start() {
  const db = getDb();
  runMigrations(db);

  const app = buildApp();
  app.listen(PORT, () => {
    console.log(`ShadowRadar v${version} running on http://localhost:${PORT}`);
  });
}

start();
