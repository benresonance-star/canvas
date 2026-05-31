import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_KEY_FILE = path.join(__dirname, '../../.data/agent-master.key');

let cachedMasterKey = null;

function parseKeyMaterial(raw) {
  const trimmed = String(raw).trim();
  let key;
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    key = Buffer.from(trimmed, 'hex');
  } else {
    key = Buffer.from(trimmed, 'base64');
  }
  if (key.length !== 32) {
    throw new Error('Master key must decode to exactly 32 bytes.');
  }
  return key;
}

function readKeyFromEnv() {
  const raw = process.env.AGENT_SECRETS_KEY;
  if (!raw || typeof raw !== 'string') return null;
  return parseKeyMaterial(raw);
}

function readKeyFromFile(filePath = DEFAULT_KEY_FILE) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  if (!raw.trim()) return null;
  return parseKeyMaterial(raw);
}

function writeKeyFile(filePath, hexKey) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, `${hexKey}\n`, { encoding: 'utf8', mode: 0o600 });
}

/**
 * Resolve AES master key: AGENT_SECRETS_KEY env, else .data/agent-master.key, else create file.
 * @param {{ keyFilePath?: string }} [options] - for tests
 */
export function resolveMasterKey(options = {}) {
  if (cachedMasterKey) return cachedMasterKey;

  const keyFilePath = options.keyFilePath ?? DEFAULT_KEY_FILE;

  const fromEnv = readKeyFromEnv();
  if (fromEnv) {
    cachedMasterKey = fromEnv;
    return cachedMasterKey;
  }

  const fromFile = readKeyFromFile(keyFilePath);
  if (fromFile) {
    cachedMasterKey = fromFile;
    return cachedMasterKey;
  }

  const hex = crypto.randomBytes(32).toString('hex');
  try {
    writeKeyFile(keyFilePath, hex);
  } catch (e) {
    throw new Error(
      `Could not create agent master key file at ${keyFilePath}: ${e.message}`,
    );
  }
  cachedMasterKey = Buffer.from(hex, 'hex');
  return cachedMasterKey;
}

/** Reset cached key (tests only). */
export function resetMasterKeyCache() {
  cachedMasterKey = null;
}

function getMasterKey() {
  return resolveMasterKey();
}

export function isSecretsKeyConfigured() {
  try {
    getMasterKey();
    return true;
  } catch {
    return false;
  }
}

/** @returns {{ ciphertext: string, iv: string }} base64-encoded */
export function encryptSecret(plaintext) {
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([encrypted, tag]);
  return {
    ciphertext: payload.toString('base64'),
    iv: iv.toString('base64'),
  };
}

/** @param {string} ciphertextB64 @param {string} ivB64 */
export function decryptSecret(ciphertextB64, ivB64) {
  const key = getMasterKey();
  const iv = Buffer.from(ivB64, 'base64');
  const payload = Buffer.from(ciphertextB64, 'base64');
  const tagLength = 16;
  if (payload.length < tagLength) {
    throw new Error('Invalid ciphertext');
  }
  const encrypted = payload.subarray(0, payload.length - tagLength);
  const tag = payload.subarray(payload.length - tagLength);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function keyHintFromApiKey(apiKey) {
  const s = String(apiKey).trim();
  if (s.length <= 8) return '••••••••';
  return `${s.slice(0, 3)}…${s.slice(-4)}`;
}
