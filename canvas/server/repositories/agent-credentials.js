import { query } from '../db.js';
import {
  encryptSecret,
  decryptSecret,
  keyHintFromApiKey,
  isSecretsKeyConfigured,
} from '../lib/secretBox.js';
import { AGENT_CONNECTORS } from '../lib/agentConnectors.js';

export function secretsAvailable() {
  return isSecretsKeyConfigured();
}

export async function listConnectorStatus() {
  const rows = await query('SELECT provider, key_hint, ciphertext, iv FROM agent_credential');
  const byProvider = new Map(rows.rows.map((r) => [r.provider, r]));

  return AGENT_CONNECTORS.map((c) => {
    const row = byProvider.get(c.provider);
    const configured = Boolean(row);
    let usable = false;
    if (configured && secretsAvailable()) {
      try {
        decryptSecret(row.ciphertext, row.iv);
        usable = true;
      } catch {
        usable = false;
      }
    }
    return {
      id: c.id,
      label: c.label,
      provider: c.provider,
      model: c.model,
      configured,
      usable,
      keyHint: row?.key_hint ?? null,
    };
  });
}

export async function saveCredential(provider, apiKey) {
  if (!secretsAvailable()) {
    throw new Error('AGENT_SECRETS_KEY is not configured on the server.');
  }
  const trimmed = String(apiKey).trim();
  if (!trimmed) throw new Error('API key is required.');

  const { ciphertext, iv } = encryptSecret(trimmed);
  const keyHint = keyHintFromApiKey(trimmed);

  await query(
    `INSERT INTO agent_credential (provider, ciphertext, iv, key_hint, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (provider) DO UPDATE SET
       ciphertext = EXCLUDED.ciphertext,
       iv = EXCLUDED.iv,
       key_hint = EXCLUDED.key_hint,
       updated_at = NOW()`,
    [provider, ciphertext, iv, keyHint],
  );

  return { keyHint };
}

export async function deleteCredential(provider) {
  await query('DELETE FROM agent_credential WHERE provider = $1', [provider]);
}

export async function getDecryptedApiKey(provider) {
  const res = await query(
    'SELECT ciphertext, iv FROM agent_credential WHERE provider = $1',
    [provider],
  );
  const row = res.rows[0];
  if (!row) return null;
  return decryptSecret(row.ciphertext, row.iv);
}
