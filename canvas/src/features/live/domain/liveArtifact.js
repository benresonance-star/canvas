import { z } from 'zod';

export const LIVE_KIND_AGENT_FEED = 'agent_feed';

export const LIVE_MODEL_OPTIONS = Object.freeze([
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    label: 'GPT-4o mini',
    reasoningEfforts: [],
  },
  {
    provider: 'openai',
    model: 'gpt-5.5',
    label: 'GPT-5.5',
    reasoningEfforts: ['none', 'low', 'medium', 'high'],
  },
  {
    provider: 'openai',
    model: 'gpt-5.5-pro',
    label: 'GPT-5.5 Pro',
    reasoningEfforts: ['medium', 'high'],
  },
]);

export const DEFAULT_LIVE_AGENT_PROMPT = `You maintain a live agent feed for a Canvas project.

Produce a careful, concise, decision-useful update from only the supplied sources.
Focus on material changes, current position, risks, open questions, and next actions.
Preserve important assumptions and constraints. Flag stale or missing information.
Do not invent facts. If nothing meaningful changed, say so clearly.
Return valid JSON matching the requested schema.`;

export const liveAgentOutputSchema = z.object({
  title: z.string().trim().min(1),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  overview: z.string().trim().min(1),
  meaningfulChangeDetected: z.boolean(),
  changeScore: z.number().min(0).max(1),
  changesSinceLastUpdate: z.array(z.string()),
  currentPosition: z.string(),
  risks: z.array(z.string()),
  openQuestions: z.array(z.string()),
  recommendedNextActions: z.array(z.string()),
  staleOrMissingInformation: z.array(z.string()),
  markdownBody: z.string().trim().min(1),
});

export function validateLiveModel(provider, model, reasoningEffort = null) {
  const option = LIVE_MODEL_OPTIONS.find(
    (entry) => entry.provider === provider && entry.model === model,
  );
  if (!option) throw new Error('Unsupported live artifact model');
  const effort = reasoningEffort || null;
  if (effort && !option.reasoningEfforts.includes(effort)) {
    throw new Error('Unsupported reasoning effort for selected model');
  }
  return { provider, model, reasoningEffort: effort };
}

/**
 * @param {string | Date | null | undefined} iso
 * @param {string | null | undefined} timezone
 * @returns {string | null} e.g. "7:30pm | 23 June 2026"
 */
export function formatLiveLastUpdated(iso, timezone = 'UTC') {
  if (!iso) return null;
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const tz = timezone || 'UTC';
  let timePart;
  let datePart;
  try {
    timePart = new Intl.DateTimeFormat('en-AU', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: tz,
    }).format(date);
    datePart = new Intl.DateTimeFormat('en-AU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: tz,
    }).format(date);
  } catch {
    return null;
  }

  const normalizedTime = timePart.toLowerCase().replace(/\s+(am|pm)$/i, '$1');
  return `${normalizedTime} | ${datePart}`;
}

export function liveArtifactCardFromRecord(live, position = { x: 100, y: 100 }) {
  return {
    id: crypto.randomUUID(),
    key: `live__${live.id}`,
    prefix: 'live',
    name: live.name,
    type: 'live',
    liveKind: live.kind,
    liveArtifactId: live.id,
    projectId: live.projectId,
    x: position.x,
    y: position.y,
    versions: [{
      version: 1,
      artifactRef: { id: live.id, type: 'artifact' },
      liveArtifactId: live.id,
      inline: true,
      ext: 'md',
      filename: live.exportFilename || `live__${live.id}-v1.md`,
    }],
    pinnedVersion: 1,
  };
}
