export const BIM_AGENT_INFO = {
  name: 'BIM Evidence Agent',
  model: 'local/bim-bql-rules-v0.1',
  source: 'prepared IFC index',
};

export const LOCAL_BIM_RULES_RESPONDER_ID = 'local-bim-rules';

export const API_OFFLINE_PROVIDER_MESSAGE =
  'Canvas API offline. Start with npm run dev:stack or npm run server.';

export function prettyQuery(query) {
  return JSON.stringify(query, null, 2);
}

export function friendlyProviderStatusMessage({ connector, connectorStatus, providerState }) {
  if (!connector) {
    return { status: 'ready', label: 'ready', message: 'Local BIM Rules ready.' };
  }
  if (providerState?.status === 'checking') {
    return { status: 'checking', label: 'checking', message: 'Checking Canvas API.' };
  }
  if (providerState?.status === 'offline') {
    return { status: 'apiOffline', label: 'API offline', message: API_OFFLINE_PROVIDER_MESSAGE };
  }
  if (!connectorStatus) {
    return {
      status: 'unavailable',
      label: 'unavailable',
      message: `${connector.label} status is unavailable. Refresh agent status.`,
    };
  }
  if (connectorStatus.usable) {
    return {
      status: 'ready',
      label: 'ready',
      message: `${connector.label} ready (${connectorStatus.model ?? connector.model}).`,
    };
  }
  const healthError = connectorStatus.healthError || '';
  if (connector.provider === 'ollama') {
    if (connectorStatus.needsPull || /not pulled/i.test(healthError)) {
      return {
        status: 'modelMissing',
        label: 'model not pulled',
        message: `${connector.model} not pulled. Pull the model before asking ${connector.label}.`,
      };
    }
    if (/cannot reach ollama|ollama.*not reachable/i.test(healthError)) {
      return {
        status: 'ollamaOffline',
        label: 'Ollama offline',
        message: 'Ollama offline. Start Ollama on localhost:11434.',
      };
    }
    return {
      status: 'ollamaUnavailable',
      label: 'Ollama unavailable',
      message: healthError || `Ollama is not ready for ${connector.label}.`,
    };
  }
  if (connector.requiresCredential !== false && !connectorStatus.configured) {
    return {
      status: 'credentialRequired',
      label: 'credential required',
      message: `${connector.label} needs an API key before it can answer.`,
    };
  }
  return {
    status: 'unavailable',
    label: 'unavailable',
    message: healthError || `${connector.label} is not ready.`,
  };
}
