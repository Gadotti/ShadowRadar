'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { getDb } = require('../db/connection');
const authService = require('../services/authService');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
  };
}

// POST /api/auth/login — public, rate-limited
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  try {
    const db = getDb();
    const { token, user } = await authService.login(db, username, password);
    res.cookie('token', token, cookieOptions());
    return res.json({ user });
  } catch {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
});

// POST /api/auth/logout — clears the cookie; idempotent
router.post('/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, sameSite: 'strict' });
  return res.json({ ok: true });
});

// GET /api/auth/me — returns the current user from the JWT payload (no DB lookup)
router.get('/me', authenticate, (req, res) => {
  return res.json({ user: req.user });
});

module.exports = router;
