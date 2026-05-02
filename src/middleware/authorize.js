'use strict';

const ROLE_RANK = { reader: 1, editor: 2 };

/**
 * authorize — factory that returns a middleware enforcing a minimum role.
 * Must be used after the `authenticate` middleware.
 *
 * Usage: router.post('/resource', authenticate, authorize('editor'), handler)
 *
 * @param {'reader'|'editor'} requiredRole
 * @returns {import('express').RequestHandler}
 */
function authorize(requiredRole) {
  return function checkRole(req, res, next) {
    const userRank = ROLE_RANK[req.user && req.user.role] || 0;
    const required = ROLE_RANK[requiredRole] || 0;

    if (userRank < required) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = authorize;
