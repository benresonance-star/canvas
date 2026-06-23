import { query } from '../db.js';
import {
  encryptSecret,
  decryptSecret,
  keyHintFromApiKey,
  isSecretsKeyConfigured,
} from '../lib/secretBox.js';
import { AGENT_CONNECTORS } from '../lib/agentConnectors.js';
import { checkOllamaReachable, fetchOllamaTags } from '../services/ollamaChat.js';

export function secretsAvailable() {
  return isSecretsKeyConfigured();
}

const DB_UNAVAILABLE_HEALTH_ERROR =
  'Database unavailable — API keys cannot be loaded. Start Postgres (npm run db:up) and restart the API.';

export async function listConnectorStatus() {
  let byProvider = new Map();
  let dbUnavailable = false;
  try {
    const rows = await query('SELECT provider, key_hint, ciphertext, iv FROM agent_credential');
    byProvider = new Map(rows.rows.map((r) => [r.provider, r]));
  } catch {
    dbUnavailable = true;
  }
  const ollamaTagsByBaseUrl = new Map();

  async function getOllamaHealth(connector) {
    const baseUrl = connector.baseUrl ?? 'http://localhost:11434';
    if (!ollamaTagsByBaseUrl.has(baseUrl)) {
      ollamaTagsByBaseUrl.set(baseUrl, fetchOllamaTags({ baseUrl }));
    }
    const tags = await ollamaTagsByBaseUrl.get(baseUrl);
    if (!tags.reachable) {
      return {
        reachable: false,
        modelAvailable: false,
        error: tags.error,
      };
    }
    return checkOllamaReachable({
      provider: connector.provider,
      connectorId: connector.id,
      models: tags.models,
    });
  }

  return Promise.all(AGENT_CONNECTORS.map(async (c) => {
    if (c.requiresCredential === false) {
      const health =
        c.provider === 'ollama'
          ? await getOllamaHealth(c)
          : { reachable: true, modelAvailable: true, error: null };
      return {
        id: c.id,
        label: c.label,
        provider: c.provider,
        model: c.model,
        baseUrl: c.baseUrl ?? null,
        requiresCredential: false,
        configured: true,
        usable: Boolean(health.reachable && health.modelAvailable),
        needsPull: Boolean(health.reachable && !health.modelAvailable),
        keyHint: null,
        healthError: health.error ?? null,
      };
    }

    if (dbUnavailable) {
      return {
        id: c.id,
        label: c.label,
        provider: c.provider,
        model: c.model,
        baseUrl: c.baseUrl ?? null,
        requiresCredential: c.requiresCredential !== false,
        configured: false,
        usable: false,
        keyHint: null,
        healthError: DB_UNAVAILABLE_HEALTH_ERROR,
      };
    }

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
      baseUrl: c.baseUrl ?? null,
      requiresCredential: c.requiresCredential !== false,
      configured,
      usable,
      keyHint: row?.key_hint ?? null,
      healthError: null,
    };
  }));
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
