'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const { getDb } = require('../db/connection');
const scanRepository = require('../repositories/scanRepository');
const configRepository = require('../repositories/configRepository');
const { ConflictError, NotFoundError } = require('../models/errors');

// Module-level state: one scan at a time
let _childProcess = null;
let _currentRunId = null;
let _cancelled = false;

function nowStr() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function getCurrentStatus(db) {
  const scriptPath = configRepository.get(db, 'scan.script_path') || './scripts/scan.py';
  if (_childProcess && _currentRunId) {
    const run = scanRepository.getRunById(db, _currentRunId);
    return { running: true, current_run: run || null, script_path: scriptPath };
  }
  return { running: false, current_run: null, script_path: scriptPath };
}

function startScan(db, { asset_id: assetId } = {}) {
  if (_childProcess) throw new ConflictError('Scan already in progress');

  const scriptPath = configRepository.get(db, 'scan.script_path') || './scripts/scan.py';
  const resolvedScript = path.resolve(scriptPath);

  if (!fs.existsSync(resolvedScript)) {
    throw new NotFoundError(`Script não encontrado: ${resolvedScript}. Configure o caminho em scan.script_path.`);
  }

  const runId = scanRepository.createRun(db, { started_at: nowStr() });
  _currentRunId = runId;
  _cancelled = false;

  const dbPath = path.resolve(process.env.DB_PATH || './data/shadowradar.db');
  const args = [resolvedScript, '--db', dbPath];
  if (assetId) args.push('--asset-id', String(assetId));

  _childProcess = spawn('python', args, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });

  _childProcess.stdout.on('data', (d) => process.stdout.write(`[scan] ${d}`));
  _childProcess.stderr.on('data', (d) => process.stderr.write(`[scan:err] ${d}`));

  _childProcess.on('close', (code) => {
    const liveDb = getDb();
    if (!_cancelled) {
      const updates = { status: code === 0 ? 'completed' : 'failed', finished_at: nowStr() };
      if (code !== 0) updates.error_message = `Process exited with code ${code}`;
      scanRepository.updateRun(liveDb, runId, updates);
    }
    _childProcess = null;
    _currentRunId = null;
    _cancelled = false;
  });

  return { scan_run_id: runId };
}

function cancelScan(db) {
  if (!_childProcess) throw new ConflictError('No scan in progress');
  _cancelled = true;
  _childProcess.kill('SIGTERM');
  scanRepository.updateRun(db, _currentRunId, {
    status: 'failed',
    finished_at: nowStr(),
    error_message: 'Cancelled by user',
  });
  _childProcess = null;
  _currentRunId = null;
}

module.exports = { getCurrentStatus, startScan, cancelScan };
