import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../lib/secretBox.js', () => ({
  decryptSecret: vi.fn(() => 'sk-test'),
  encryptSecret: vi.fn(() => ({ ciphertext: 'cipher', iv: 'iv' })),
  keyHintFromApiKey: vi.fn(() => 'sk-...test'),
  isSecretsKeyConfigured: vi.fn(() => true),
}));

vi.mock('../../services/ollamaChat.js', async () => {
  const actual = await vi.importActual('../../services/ollamaChat.js');
  return {
    ...actual,
    fetchOllamaTags: vi.fn(),
  };
});

const db = await import('../../db.js');
const ollama = await import('../../services/ollamaChat.js');
const { listConnectorStatus } = await import('../agent-credentials.js');

describe('agent credential connector status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.query.mockResolvedValue({ rows: [] });
  });

  it('reports Ollama connector usability per model tag', async () => {
    ollama.fetchOllamaTags.mockResolvedValue({
      reachable: true,
      models: [{ name: 'gemma4:12b' }],
      error: null,
    });

    const connectors = await listConnectorStatus();
    const gemma12b = connectors.find((connector) => connector.id === 'ollama-gemma-12b');
    const gemma26b = connectors.find((connector) => connector.id === 'ollama-gemma-26b');

    expect(gemma12b).toMatchObject({
      model: 'gemma4:12b',
      usable: true,
      healthError: null,
      capabilities: {
        canReadImages: true,
        canReadText: true,
        canUseTools: false,
      },
    });
    expect(gemma26b).toMatchObject({
      model: 'gemma4:26b',
      usable: false,
      needsPull: true,
      healthError: 'Ollama is running, but gemma4:26b is not pulled.',
    });
    expect(ollama.fetchOllamaTags).toHaveBeenCalledTimes(1);
  });

  it('marks both Ollama connectors usable when both models are pulled', async () => {
    ollama.fetchOllamaTags.mockResolvedValue({
      reachable: true,
      models: [{ name: 'gemma4:12b' }, { name: 'gemma4:26b' }],
      error: null,
    });

    const connectors = await listConnectorStatus();

    expect(connectors.find((connector) => connector.id === 'ollama-gemma-12b')?.usable)
      .toBe(true);
    expect(connectors.find((connector) => connector.id === 'ollama-gemma-26b')?.usable)
      .toBe(true);
  });

  it('still reports Ollama health when credential DB query fails', async () => {
    db.query.mockRejectedValue(new Error('connection refused'));
    ollama.fetchOllamaTags.mockResolvedValue({
      reachable: true,
      models: [{ name: 'gemma4:12b' }, { name: 'gemma4:26b' }],
      error: null,
    });

    const connectors = await listConnectorStatus();
    const openai = connectors.find((connector) => connector.id === 'openai');
    const gemma26b = connectors.find((connector) => connector.id === 'ollama-gemma-26b');

    expect(openai).toMatchObject({
      configured: false,
      usable: false,
      healthError: expect.stringContaining('Database unavailable'),
    });
    expect(gemma26b).toMatchObject({
      configured: true,
      usable: true,
      healthError: null,
    });
    expect(ollama.fetchOllamaTags).toHaveBeenCalled();
  });
});
