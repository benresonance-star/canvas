/** USD per 1M input tokens (approximate; update when OpenAI changes pricing). */
const INPUT_USD_PER_MILLION = {
  'gpt-4o-mini': 0.15,
  'gpt-4o': 2.5,
  'gpt-4.1-mini': 0.4,
  'gpt-4.1': 2.0,
  'gpt-5.5': 1.25,
  'openai/gpt-5.5': 1.25,
};

/**
 * @param {string} model
 * @param {number} inputTokens
 */
export function estimateInputCostUsd(model, inputTokens) {
  const rate =
    INPUT_USD_PER_MILLION[model] ??
    INPUT_USD_PER_MILLION['gpt-4o-mini'];
  return (inputTokens / 1_000_000) * rate;
}
