import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  encryptSecret,
  decryptSecret,
  keyHintFromApiKey,
  resolveMasterKey,
  resetMasterKeyCache,
  isSecretsKeyConfigured,
} from '../secretBox.js';

describe('secretBox', () => {
  const prev = process.env.AGENT_SECRETS_KEY;
  let tmpDir;

  beforeEach(() => {
    resetMasterKeyCache();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-secret-'));
    delete process.env.AGENT_SECRETS_KEY;
  });

  afterEach(() => {
    resetMasterKeyCache();
    if (prev === undefined) delete process.env.AGENT_SECRETS_KEY;
    else process.env.AGENT_SECRETS_KEY = prev;
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('round-trips plaintext with env key', () => {
    process.env.AGENT_SECRETS_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const plain = 'sk-test-secret-key-12345';
    const { ciphertext, iv } = encryptSecret(plain);
    expect(decryptSecret(ciphertext, iv)).toBe(plain);
  });

  it('auto-provisions master key file when env unset', () => {
    const keyFile = path.join(tmpDir, 'agent-master.key');
    expect(fs.existsSync(keyFile)).toBe(false);
    resolveMasterKey({ keyFilePath: keyFile });
    expect(fs.existsSync(keyFile)).toBe(true);
    expect(isSecretsKeyConfigured()).toBe(true);
    const plain = 'sk-auto-key';
    const { ciphertext, iv } = encryptSecret(plain);
    resetMasterKeyCache();
    resolveMasterKey({ keyFilePath: keyFile });
    expect(decryptSecret(ciphertext, iv)).toBe(plain);
  });

  it('builds key hint without exposing full key', () => {
    process.env.AGENT_SECRETS_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const hint = keyHintFromApiKey('sk-abcdefghijklmnop');
    expect(hint).toContain('…');
    expect(hint).not.toBe('sk-abcdefghijklmnop');
  });
});
