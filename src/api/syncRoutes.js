'use strict';

const express = require('express');
const { getDb } = require('../db/connection');
const authenticateApiKey = require('../middleware/authenticateApiKey');
const assetRepository = require('../repositories/assetRepository');

const router = express.Router();

router.use(authenticateApiKey);

function validateUpsert(item) {
  if (!item.name || typeof item.name !== 'string' || !item.name.trim())
    return 'name is required';
  if (!item.current_version || typeof item.current_version !== 'string' || !item.current_version.trim())
    return 'current_version is required';
  return null;
}

router.post('/', (req, res) => {
  const assets = req.body?.assets;
  if (!Array.isArray(assets)) return res.status(400).json({ error: '"assets" array is required' });

  const db = getDb();
  let created = 0, updated = 0, unchanged = 0;
  const errors = [];

  for (let i = 0; i < assets.length; i++) {
    const item = assets[i];

    // Need name to do the lookup, validate name first
    if (!item?.name || typeof item.name !== 'string' || !item.name.trim()) {
      errors.push({ index: i, name: item?.name || null, tag: item?.tag || null, error: 'name is required' });
      continue;
    }

    try {
      const name    = item.name.trim();
      const tag     = item.tag ? String(item.tag).trim() : null;
      const active  = item.active !== false ? 1 : 0;

      const existing = assetRepository.findByNameAndOptionalTag(db, name, tag);

      const validationErr = validateUpsert({ ...item, name, tag });
      if (validationErr) { errors.push({ index: i, name, tag, error: validationErr }); continue; }

      if (!existing) {
        assetRepository.create(db, {
          name,
          tag,
          description:     item.description ?? null,
          url:             item.url ?? null,
          current_version: item.current_version.trim(),
          cve_start_date:  item.cve_start_date ?? null,
          active,
        });
        created++;
      } else {
        // Never overwrite cve_start_date if already set in the database
        const cveStartDate = existing.cve_start_date || item.cve_start_date || null;
        assetRepository.update(db, existing.id, {
          name,
          tag,
          description:     item.description ?? existing.description,
          url:             item.url ?? existing.url,
          current_version: item.current_version.trim(),
          cve_start_date:  cveStartDate,
          active,
        });
        updated++;
      }
    } catch (err) {
      errors.push({ index: i, name: item.name, tag: item.tag || null, error: err.message });
    }
  }

  return res.json({ created, updated, unchanged, errors });
});

module.exports = router;
