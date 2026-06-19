export const AGENT_PANEL_MODES = ['multi', 'single'];

export const CONNECTORS = [
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

export const DEFAULT_SINGLE_CONNECTOR_ID = 'openai';

export function getConnectorById(id) {
  return CONNECTORS.find((c) => c.id === id) ?? null;
}

export function getConnectorByProvider(provider) {
  return CONNECTORS.find((c) => c.provider === provider) ?? null;
}

export function getConnectorProvider(id) {
  return getConnectorById(id)?.provider ?? null;
}

export function defaultAgentTypeLabelForProvider(provider) {
  if (provider === 'ollama') return 'Default Gemma agent';
  return 'Default ChatGPT agent';
}

export function agentTypeCompatibilityMessage(provider) {
  if (provider === 'ollama') {
    return 'Change this thread to a Gemma-compatible Agent Type before chatting.';
  }
  return 'Change this thread to a ChatGPT-compatible Agent Type before chatting.';
}

export const AGENT_API_OFFLINE_MESSAGE =
  'Cannot reach the API. Start it with npm run server in the canvas folder.';

export function agentInputDisabledMessage({
  activeConnector,
  hasActiveThread,
  threadCompatible = true,
  connectorsOffline = false,
}) {
  if (!hasActiveThread) return 'Start or select a thread to chat.';
  if (!threadCompatible) {
    return agentTypeCompatibilityMessage(activeConnector?.provider);
  }
  if (connectorsOffline) {
    return AGENT_API_OFFLINE_MESSAGE;
  }
  if (activeConnector?.requiresCredential === false) {
    return activeConnector?.healthError
      || 'Start Ollama on localhost:11434 and pull the selected model before chatting.';
  }
  return 'Add an API key to chat with this agent.';
}

/**
 * @param {typeof CONNECTORS[number] | null} connectorDef
 * @param {{ configured?: boolean, usable?: boolean, keyHint?: string | null, healthError?: string | null } | null | undefined} connectorMeta
 */
export function mergeConnectorMeta(connectorDef, connectorMeta) {
  if (!connectorDef) return null;
  return {
    ...connectorDef,
    configured: connectorMeta?.configured ?? false,
    usable: connectorMeta?.usable ?? false,
    keyHint: connectorMeta?.keyHint ?? null,
    healthError: connectorMeta?.healthError ?? null,
  };
}

/**
 * @param {{ panelMode: string, secretsConfigured: boolean, activeConnector: { usable?: boolean, requiresCredential?: boolean } | null }} options
 */
export function agentCanChat({ panelMode, secretsConfigured, activeConnector }) {
  return (
    panelMode === 'single'
    && Boolean(activeConnector?.usable)
    && (activeConnector?.requiresCredential === false || secretsConfigured)
  );
}
