'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userRepository = require('../repositories/userRepository');

const JWT_EXPIRY = '30d';

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return secret;
}

/**
 * login — validates credentials and returns a signed JWT.
 * Throws an error (with a generic message) on invalid credentials.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ token: string, user: object }>}
 */
async function login(db, username, password) {
  const user = userRepository.findByUsername(db, username);
  if (!user) throw new Error('Invalid credentials');

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) throw new Error('Invalid credentials');

  const payload = { userId: user.id, username: user.username, role: user.role };
  const token = jwt.sign(payload, jwtSecret(), { algorithm: 'HS256', expiresIn: JWT_EXPIRY });

  return {
    token,
    user: { id: user.id, name: user.name, username: user.username, role: user.role },
  };
}

/**
 * verifyToken — decodes and validates a JWT string.
 * Throws if the token is missing, expired, or tampered.
 *
 * @param {string} token
 * @returns {object} decoded payload
 */
function verifyToken(token) {
  return jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] });
}

module.exports = { login, verifyToken };
