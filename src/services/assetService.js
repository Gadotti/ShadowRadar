'use strict';

const assetRepository = require('../repositories/assetRepository');
const { NotFoundError, ConflictError, ValidationError } = require('../models/errors');

function validateAssetData({ name, current_version, cve_start_date }) {
  if (!name || !String(name).trim()) {
    throw new ValidationError('name is required');
  }
  if (!current_version || !String(current_version).trim()) {
    throw new ValidationError('current_version is required');
  }
  if (cve_start_date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cve_start_date)) {
      throw new ValidationError('cve_start_date must be in YYYY-MM-DD format');
    }
    const today = new Date().toISOString().slice(0, 10);
    if (cve_start_date > today) {
      throw new ValidationError('cve_start_date cannot be a future date');
    }
  }
}

function enrichAsset(db, asset) {
  return {
    ...asset,
    cve_count: assetRepository.getCveCount(db, asset.id),
    last_scan: assetRepository.getLastScanDate(db, asset.id),
  };
}

function listAssets(db, { search, active, page, page_size } = {}) {
  const pageNum = Math.max(1, parseInt(page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(page_size) || 20));
  const activeFilter = ['0', '1', 'all'].includes(active) ? active : 'all';
  const { items, total } = assetRepository.findAll(db, {
    search: search || null,
    active: activeFilter,
    page: pageNum,
    pageSize,
  });
  return { items, total, page: pageNum, page_size: pageSize };
}

function getAsset(db, id) {
  const asset = assetRepository.findById(db, id);
  if (!asset) throw new NotFoundError('Asset not found');
  return enrichAsset(db, asset);
}

function createAsset(db, data) {
  validateAssetData(data);
  const { name, tag } = data;
  if (tag && assetRepository.findByNameAndTag(db, name, tag)) {
    throw new ConflictError('Asset with this name and tag already exists');
  }
  const id = assetRepository.create(db, data);
  return enrichAsset(db, assetRepository.findById(db, id));
}

function updateAsset(db, id, data) {
  if (!assetRepository.findById(db, id)) throw new NotFoundError('Asset not found');
  validateAssetData(data);
  const { name, tag } = data;
  if (tag) {
    const duplicate = assetRepository.findByNameAndTag(db, name, tag);
    if (duplicate && duplicate.id !== id) {
      throw new ConflictError('Asset with this name and tag already exists');
    }
  }
  assetRepository.update(db, id, data);
  return enrichAsset(db, assetRepository.findById(db, id));
}

function deleteAsset(db, id) {
  if (!assetRepository.findById(db, id)) throw new NotFoundError('Asset not found');
  assetRepository.remove(db, id);
}

function toggleActive(db, id) {
  const asset = assetRepository.findById(db, id);
  if (!asset) throw new NotFoundError('Asset not found');
  assetRepository.setActive(db, id, asset.active ? 0 : 1);
  return enrichAsset(db, assetRepository.findById(db, id));
}

module.exports = { listAssets, getAsset, createAsset, updateAsset, deleteAsset, toggleActive };
