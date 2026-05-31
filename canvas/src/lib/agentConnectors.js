export const AGENT_PANEL_MODES = ['multi', 'single'];

export const CONNECTORS = [
  {
    id: 'openai',
    label: 'ChatGPT',
    provider: 'openai',
    model: 'gpt-4o-mini',
  },
];

export const DEFAULT_SINGLE_CONNECTOR_ID = 'openai';

export function getConnectorById(id) {
  return CONNECTORS.find((c) => c.id === id) ?? null;
}

export function getConnectorProvider(id) {
  return getConnectorById(id)?.provider ?? null;
}

/**
 * @param {typeof CONNECTORS[number] | null} connectorDef
 * @param {{ configured?: boolean, usable?: boolean, keyHint?: string | null } | null | undefined} connectorMeta
 */
export function mergeConnectorMeta(connectorDef, connectorMeta) {
  if (!connectorDef) return null;
  return {
    ...connectorDef,
    configured: connectorMeta?.configured ?? false,
    usable: connectorMeta?.usable ?? false,
    keyHint: connectorMeta?.keyHint ?? null,
  };
}

/**
 * @param {{ panelMode: string, secretsConfigured: boolean, activeConnector: { usable?: boolean } | null }} options
 */
export function agentCanChat({ panelMode, secretsConfigured, activeConnector }) {
  return (
    panelMode === 'single'
    && Boolean(activeConnector?.usable)
    && secretsConfigured
  );
}
