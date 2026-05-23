'use strict';

const express = require('express');
const { getDb } = require('../db/connection');
const userRepository = require('../repositories/userRepository');
const authorize = require('../middleware/authorize');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const users = userRepository.listAll(getDb());
    return res.json({ users });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authorize('editor'), (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  if (id === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  try {
    const user = userRepository.findById(getDb(), id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    userRepository.deleteById(getDb(), id);
    return res.status(204).end();
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
