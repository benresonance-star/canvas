export const AGENT_CONNECTORS = [
  {
    id: 'openai',
    label: 'ChatGPT',
    provider: 'openai',
    model: 'gpt-4o-mini',
    requiresCredential: true,
  },
  {
    id: 'ollama-gemma-12b',
    label: 'Gemma 12B Local',
    provider: 'ollama',
    model: 'gemma4:12b',
    baseUrl: 'http://localhost:11434',
    requiresCredential: false,
  },
  {
    id: 'ollama-gemma-26b',
    label: 'Gemma 26B Local',
    provider: 'ollama',
    model: 'gemma4:26b',
    baseUrl: 'http://localhost:11434',
    requiresCredential: false,
  },
];

const BY_PROVIDER = new Map();
for (const connector of AGENT_CONNECTORS) {
  if (!BY_PROVIDER.has(connector.provider)) {
    BY_PROVIDER.set(connector.provider, connector);
  }
}
const BY_ID = new Map(AGENT_CONNECTORS.map((c) => [c.id, c]));

export function getConnectorByProvider(provider) {
  return BY_PROVIDER.get(provider) ?? null;
}

export function getConnectorById(id) {
  return BY_ID.get(id) ?? null;
}

export function isAllowedProvider(provider) {
  return BY_PROVIDER.has(provider);
}

export function providerRequiresCredential(provider) {
  const connector = getConnectorByProvider(provider);
  return connector?.requiresCredential !== false;
}

export function normalizeProviderModelId(provider, model) {
  const value = String(model || '').trim();
  if (!value) return value;
  const prefix = `${provider}/`;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}
