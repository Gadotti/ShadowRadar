'use strict';

const { verifyToken } = require('../services/authService');

/**
 * authenticate — Express middleware that validates the JWT from the `token` cookie.
 * Injects req.user = { id, username, role } on success.
 * Responds 401 if the cookie is absent or the token is invalid/expired.
 */
function authenticate(req, res, next) {
  const token = req.cookies && req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = verifyToken(token);
    req.user = { id: payload.userId, username: payload.username, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

module.exports = authenticate;
