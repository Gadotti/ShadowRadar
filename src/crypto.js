'use strict';

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_ENV   = 'ENCRYPTION_KEY';

function _getKey() {
  const hex = process.env[KEY_ENV];
  if (!hex || hex.length !== 64) {
    throw new Error(
      `${KEY_ENV} must be a 64-character hex string (32 bytes). ` +
      'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(hex, 'hex');
}

// Returns "ivHex:tagHex:ciphertextHex"
function encrypt(plaintext) {
  const key    = _getKey();
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

// Accepts the format returned by encrypt()
function decrypt(encryptedStr) {
  const parts = encryptedStr.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted value format (expected ivHex:tagHex:ciphertextHex)');
  }
  const [ivHex, tagHex, dataHex] = parts;
  const key      = _getKey();
  const iv       = Buffer.from(ivHex, 'hex');
  const tag      = Buffer.from(tagHex, 'hex');
  const data     = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data).toString('utf8') + decipher.final('utf8');
}

module.exports = { encrypt, decrypt };
