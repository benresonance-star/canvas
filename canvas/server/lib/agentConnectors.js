export const AGENT_CONNECTORS = [
  {
    id: 'openai',
    label: 'ChatGPT',
    provider: 'openai',
    model: 'gpt-4o-mini',
  },
];

const BY_PROVIDER = new Map(AGENT_CONNECTORS.map((c) => [c.provider, c]));

export function getConnectorByProvider(provider) {
  return BY_PROVIDER.get(provider) ?? null;
}

export function isAllowedProvider(provider) {
  return BY_PROVIDER.has(provider);
}
