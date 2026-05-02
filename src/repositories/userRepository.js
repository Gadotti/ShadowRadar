'use strict';

/**
 * findByUsername — looks up a user by login username.
 * @param {import('better-sqlite3').Database} db
 * @param {string} username
 * @returns {object|undefined}
 */
function findByUsername(db, username) {
  return db
    .prepare('SELECT id, name, username, password_hash, role, created_at FROM users WHERE username = ?')
    .get(username);
}

/**
 * findById — looks up a user by primary key.
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 * @returns {object|undefined}
 */
function findById(db, id) {
  return db
    .prepare('SELECT id, name, username, role, created_at FROM users WHERE id = ?')
    .get(id);
}

/**
 * create — inserts a new user and returns the generated id.
 * @param {import('better-sqlite3').Database} db
 * @param {{ name: string, username: string, passwordHash: string, role: string }} user
 * @returns {number}
 */
function create(db, { name, username, passwordHash, role }) {
  const result = db
    .prepare('INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(name, username, passwordHash, role);
  return result.lastInsertRowid;
}

module.exports = { findByUsername, findById, create };
