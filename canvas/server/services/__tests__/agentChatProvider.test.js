import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../openaiChat.js', () => ({
  completeChat: vi.fn(),
}));

vi.mock('../ollamaChat.js', () => ({
  completeOllamaChat: vi.fn(),
}));

const openai = await import('../openaiChat.js');
const ollama = await import('../ollamaChat.js');
const { chatProviderRequiresCredential, completeAgentChat } = await import('../agentChatProvider.js');

describe('agentChatProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openai.completeChat.mockResolvedValue({ reply: 'openai', model: 'gpt-4o-mini' });
    ollama.completeOllamaChat.mockResolvedValue({ reply: 'ollama', model: 'gemma4:12b' });
  });

  it('routes OpenAI through the credentialed OpenAI adapter', async () => {
    const result = await completeAgentChat({
      apiKey: 'sk-test',
      provider: 'openai',
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(result.reply).toBe('openai');
    expect(openai.completeChat).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'sk-test',
      provider: 'openai',
    }));
  });

  it('routes Ollama without requiring an API key', async () => {
    const result = await completeAgentChat({
      provider: 'ollama',
      connectorId: 'ollama-gemma-26b',
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(result.reply).toBe('ollama');
    expect(ollama.completeOllamaChat).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'ollama',
      connectorId: 'ollama-gemma-26b',
    }));
  });

  it('knows which providers require credentials', () => {
    expect(chatProviderRequiresCredential('openai')).toBe(true);
    expect(chatProviderRequiresCredential('ollama')).toBe(false);
  });
});
