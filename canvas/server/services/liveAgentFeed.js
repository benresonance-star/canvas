import { fetchOpenAI } from '../lib/openaiFetch.js';
import { getDecryptedApiKey } from '../repositories/agent-credentials.js';
import { liveAgentOutputSchema } from '../../src/features/live/domain/liveArtifact.js';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export function buildLiveAgentContext(live, sourceContext, timestamp = new Date()) {
  return [
    `Live artifact: ${live.name}`,
    `Kind: ${live.kind}`,
    `Project timezone: ${live.timezone}`,
    `Run timestamp: ${timestamp.toISOString()}`,
    '',
    sourceContext || 'No enabled source content was supplied.',
    '',
    'Create the next live feed entry.',
  ].join('\n');
}

function stripJsonFence(value) {
  const text = String(value || '').trim();
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
}

export async function generateLiveAgentFeed({ live, sourceContext }) {
  if (live.provider !== 'openai') throw new Error('Only OpenAI live agent feeds are supported');
  const apiKey = await getDecryptedApiKey('openai');
  if (!apiKey) throw new Error('OpenAI API key is not configured');
  const payload = {
    model: live.model,
    messages: [
      { role: 'system', content: live.systemPrompt },
      { role: 'user', content: buildLiveAgentContext(live, sourceContext) },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'canvas_live_agent_feed',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: [
            'title', 'reportDate', 'overview', 'meaningfulChangeDetected', 'changeScore',
            'changesSinceLastUpdate', 'currentPosition', 'risks', 'openQuestions',
            'recommendedNextActions', 'staleOrMissingInformation', 'markdownBody',
          ],
          properties: {
            title: { type: 'string' },
            reportDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
            overview: { type: 'string' },
            meaningfulChangeDetected: { type: 'boolean' },
            changeScore: { type: 'number', minimum: 0, maximum: 1 },
            changesSinceLastUpdate: { type: 'array', items: { type: 'string' } },
            currentPosition: { type: 'string' },
            risks: { type: 'array', items: { type: 'string' } },
            openQuestions: { type: 'array', items: { type: 'string' } },
            recommendedNextActions: { type: 'array', items: { type: 'string' } },
            staleOrMissingInformation: { type: 'array', items: { type: 'string' } },
            markdownBody: { type: 'string' },
          },
        },
      },
    },
  };
  if (live.reasoningEffort) payload.reasoning_effort = live.reasoningEffort;
  const response = await fetchOpenAI(OPENAI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || `OpenAI request failed (${response.status})`);
  }
  const content = body?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned no live artifact content');
  let parsed;
  try {
    parsed = JSON.parse(stripJsonFence(content));
  } catch {
    throw new Error('OpenAI returned invalid JSON');
  }
  return liveAgentOutputSchema.parse(parsed);
}
