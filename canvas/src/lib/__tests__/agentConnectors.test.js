import { describe, expect, it } from 'vitest';
import {
  CONNECTORS,
  DEFAULT_SINGLE_CONNECTOR_ID,
  agentCanChat,
  getConnectorById,
  getConnectorProvider,
  mergeConnectorMeta,
} from '../agentConnectors.js';

describe('agentConnectors', () => {
  it('includes ChatGPT connector', () => {
    expect(CONNECTORS.some((c) => c.id === 'openai' && c.label === 'ChatGPT')).toBe(true);
  });

  it('resolves provider from connector id', () => {
    expect(getConnectorProvider(DEFAULT_SINGLE_CONNECTOR_ID)).toBe('openai');
  });

  it('mergeConnectorMeta copies usable from API meta', () => {
    const def = getConnectorById('openai');
    const merged = mergeConnectorMeta(def, {
      configured: true,
      usable: true,
      keyHint: 'sk-…1234',
    });
    expect(merged?.usable).toBe(true);
    expect(merged?.configured).toBe(true);
    expect(merged?.keyHint).toBe('sk-…1234');
  });

  it('mergeConnectorMeta defaults usable to false', () => {
    const def = getConnectorById('openai');
    const merged = mergeConnectorMeta(def, { configured: true });
    expect(merged?.usable).toBe(false);
  });

  it('agentCanChat is true when single mode and connector usable', () => {
    const active = mergeConnectorMeta(getConnectorById('openai'), {
      configured: true,
      usable: true,
    });
    expect(
      agentCanChat({
        panelMode: 'single',
        secretsConfigured: true,
        activeConnector: active,
      }),
    ).toBe(true);
  });

  it('agentCanChat is false when usable is missing from merge', () => {
    const active = mergeConnectorMeta(getConnectorById('openai'), {
      configured: true,
    });
    expect(
      agentCanChat({
        panelMode: 'single',
        secretsConfigured: true,
        activeConnector: active,
      }),
    ).toBe(false);
  });
});
