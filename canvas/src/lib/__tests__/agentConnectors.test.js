import { describe, expect, it } from 'vitest';
import {
  CONNECTORS,
  DEFAULT_SINGLE_CONNECTOR_ID,
  AGENT_API_OFFLINE_MESSAGE,
  agentInputDisabledMessage,
  agentCanChat,
  connectorNeedsOllamaPull,
  defaultAgentTypeLabelForProvider,
  getConnectorById,
  getConnectorByProvider,
  getConnectorProvider,
  getConnectorCapabilities,
  contextCardsIncludeImages,
  imagesUnsupportedForConnector,
  mergeConnectorMeta,
} from '../agentConnectors.js';

describe('agentConnectors', () => {
  it('includes ChatGPT connector', () => {
    expect(CONNECTORS.some((c) => c.id === 'openai' && c.label === 'ChatGPT')).toBe(true);
  });

  it('includes Gemma 12B Local connector', () => {
    expect(
      CONNECTORS.some(
        (c) =>
          c.id === 'ollama-gemma-12b' &&
          c.label === 'Gemma 12B Local' &&
          c.provider === 'ollama' &&
          c.model === 'gemma4:12b' &&
          c.requiresCredential === false,
      ),
    ).toBe(true);
  });

  it('includes Gemma 26B Local connector', () => {
    expect(
      CONNECTORS.some(
        (c) =>
          c.id === 'ollama-gemma-26b' &&
          c.label === 'Gemma 26B Local' &&
          c.provider === 'ollama' &&
          c.model === 'gemma4:26b' &&
          c.requiresCredential === false,
      ),
    ).toBe(true);
  });

  it('resolves provider from connector id', () => {
    expect(getConnectorProvider(DEFAULT_SINGLE_CONNECTOR_ID)).toBe('openai');
    expect(getConnectorProvider('ollama-gemma-12b')).toBe('ollama');
    expect(getConnectorProvider('ollama-gemma-26b')).toBe('ollama');
    expect(getConnectorByProvider('ollama')?.id).toBe('ollama-gemma-12b');
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

  it('agentCanChat allows usable credentialless connectors without secrets', () => {
    const active = mergeConnectorMeta(getConnectorById('ollama-gemma-12b'), {
      configured: true,
      usable: true,
    });
    expect(
      agentCanChat({
        panelMode: 'single',
        secretsConfigured: false,
        activeConnector: active,
      }),
    ).toBe(true);
  });

  it('agentCanChat allows usable Gemma 26B without secrets', () => {
    const active = mergeConnectorMeta(getConnectorById('ollama-gemma-26b'), {
      configured: true,
      usable: true,
    });
    expect(
      agentCanChat({
        panelMode: 'single',
        secretsConfigured: false,
        activeConnector: active,
      }),
    ).toBe(true);
  });

  it('labels provider defaults for Agent Types', () => {
    expect(defaultAgentTypeLabelForProvider('openai')).toBe('Default ChatGPT agent');
    expect(defaultAgentTypeLabelForProvider('ollama')).toBe('Default Gemma agent');
  });

  it('explains disabled local and incompatible thread chat states', () => {
    const local = mergeConnectorMeta(getConnectorById('ollama-gemma-12b'), {
      configured: true,
      usable: false,
      healthError: 'Ollama model missing',
    });
    expect(
      agentInputDisabledMessage({
        activeConnector: local,
        hasActiveThread: true,
      }),
    ).toBe('Ollama model missing');
    expect(
      agentInputDisabledMessage({
        activeConnector: local,
        hasActiveThread: true,
        threadCompatible: false,
      }),
    ).toContain('Gemma-compatible');
  });

  it('uses model-specific disabled copy for missing Gemma 26B', () => {
    const local = mergeConnectorMeta(getConnectorById('ollama-gemma-26b'), {
      configured: true,
      usable: false,
      healthError: 'Ollama is running, but gemma4:26b is not pulled.',
    });
    expect(
      agentInputDisabledMessage({
        activeConnector: local,
        hasActiveThread: true,
      }),
    ).toContain('gemma4:26b');
  });

  it('prefers API offline copy over generic Ollama placeholder', () => {
    const local = mergeConnectorMeta(getConnectorById('ollama-gemma-26b'), {
      configured: false,
      usable: false,
    });
    expect(
      agentInputDisabledMessage({
        activeConnector: local,
        hasActiveThread: true,
        connectorsOffline: true,
      }),
    ).toBe(AGENT_API_OFFLINE_MESSAGE);
  });

  it('detects Ollama pull need from needsPull or stale healthError', () => {
    expect(connectorNeedsOllamaPull({ needsPull: true, usable: false }, 'ollama-gemma-26b')).toBe(true);
    expect(
      connectorNeedsOllamaPull(
        {
          usable: false,
          healthError: 'Ollama is running, but gemma4:26b is not pulled.',
        },
        'ollama-gemma-26b',
      ),
    ).toBe(true);
    expect(connectorNeedsOllamaPull({ usable: true }, 'ollama-gemma-26b')).toBe(false);
    expect(
      connectorNeedsOllamaPull(
        { usable: false, healthError: 'Cannot reach Ollama at http://localhost:11434.' },
        'ollama-gemma-26b',
      ),
    ).toBe(false);
  });

  it('exposes vision capabilities on Gemma connectors', () => {
    expect(getConnectorCapabilities('ollama-gemma-12b')).toEqual({
      canReadImages: true,
      canReadText: true,
      canUseTools: false,
    });
    expect(getConnectorCapabilities('ollama-gemma-26b').canReadImages).toBe(true);
    expect(getConnectorCapabilities('openai').canUseTools).toBe(true);
  });

  it('detects image context cards and unsupported connectors', () => {
    const cards = [{ id: 'img-1', type: 'image' }, { id: 'note-1', type: 'markdown' }];
    expect(contextCardsIncludeImages(cards, { 'img-1': 'included' })).toBe(true);
    expect(contextCardsIncludeImages(cards, { 'img-1': 'error' })).toBe(false);
    expect(
      imagesUnsupportedForConnector('ollama-gemma-12b', true),
    ).toBe(false);
    expect(
      imagesUnsupportedForConnector('openai', true, {
        capabilities: { canReadImages: false, canReadText: true, canUseTools: false },
      }),
    ).toBe(true);
    expect(imagesUnsupportedForConnector('openai', false)).toBe(false);
  });
});
