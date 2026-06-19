import { providerRequiresCredential } from '../lib/agentConnectors.js';
import { completeChat } from './openaiChat.js';
import { completeOllamaChat } from './ollamaChat.js';

/**
 * @param {{ apiKey?: string | null, provider: string, messages: object[], systemContext?: string, model?: string | null }} params
 */
export async function completeAgentChat(params) {
  if (params.provider === 'openai') {
    if (!params.apiKey) {
      throw new Error('API key not configured for this agent');
    }
    return completeChat(params);
  }

  if (params.provider === 'ollama') {
    return completeOllamaChat(params);
  }

  throw new Error(`Unknown provider: ${params.provider}`);
}

export function chatProviderRequiresCredential(provider) {
  return providerRequiresCredential(provider);
}
