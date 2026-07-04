import { beatAgentCardFromRecord } from '../features/music/agents/beat/domain/beatAgentCard.js';
import { agentCardFromRecord } from '../features/agents/domain/agentArtifact.js';
import { fetchMusicAgents } from '../features/music/api/musicApi.js';
import { fetchAgents } from '../features/agents/api/agentsApi.js';

const DEFAULT_START_X = 120;
const DEFAULT_START_Y = 120;
const DEFAULT_GAP_X = 320;
const DEFAULT_GAP_Y = 240;
const DEFAULT_COLS = 4;

export function hasBeatAgentCard(cards, agentId) {
  if (!agentId) return false;
  return (cards ?? []).some((card) => (
    card?.type === 'music-agent'
    && (
      card.musicAgentId === agentId
      || card.id === `music-agent-${agentId}`
      || card.versions?.some((version) => version.musicAgentId === agentId)
      || card.versions?.some((version) => version.artifactRef?.id === agentId)
    )
  ));
}

export function hasImageAgentCard(cards, agentId) {
  if (!agentId) return false;
  return (cards ?? []).some((card) => (
    card?.type === 'agent'
    && (
      card.agentArtifactId === agentId
      || card.versions?.some((version) => version.agentArtifactId === agentId)
      || card.versions?.some((version) => version.artifactRef?.id === agentId)
    )
  ));
}

function gridPosition(index, opts = {}) {
  const startX = opts.startX ?? DEFAULT_START_X;
  const startY = opts.startY ?? DEFAULT_START_Y;
  const gapX = opts.gapX ?? DEFAULT_GAP_X;
  const gapY = opts.gapY ?? DEFAULT_GAP_Y;
  const cols = opts.cols ?? DEFAULT_COLS;
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    x: startX + col * gapX,
    y: startY + row * gapY,
  };
}

/**
 * Restore missing music-agent and image-generator cards from known DB records.
 * @param {object[]} cards
 * @param {{ beatAgents?: object[], imageAgents?: object[] }} records
 * @param {object} [layoutOpts]
 */
export function restoreEphemeralAgentCardsFromRecords(
  cards,
  { beatAgents = [], imageAgents = [] } = {},
  layoutOpts = {},
) {
  let nextCards = [...(cards ?? [])];
  let beatRestored = 0;
  let agentRestored = 0;
  let layoutIndex = nextCards.length;

  for (const agent of beatAgents) {
    if (!agent?.id || agent.deletedAt) continue;
    if (agent.agentType && agent.agentType !== 'beat') continue;
    if (hasBeatAgentCard(nextCards, agent.id)) continue;
    nextCards.push(beatAgentCardFromRecord(agent, gridPosition(layoutIndex, layoutOpts)));
    layoutIndex += 1;
    beatRestored += 1;
  }

  for (const agent of imageAgents) {
    if (!agent?.id || agent.archivedAt) continue;
    if (hasImageAgentCard(nextCards, agent.id)) continue;
    nextCards.push(agentCardFromRecord(agent, gridPosition(layoutIndex, layoutOpts)));
    layoutIndex += 1;
    agentRestored += 1;
  }

  return {
    cards: nextCards,
    restored: { beat: beatRestored, agent: agentRestored },
    changed: beatRestored + agentRestored > 0,
  };
}

/**
 * Fetch project agents from the API and restore any missing ephemeral canvas cards.
 * @param {{
 *   projectId?: string | null,
 *   cards?: object[],
 *   fetchBeatAgents?: (projectId: string) => Promise<object[]>,
 *   fetchImageAgents?: (projectId: string) => Promise<object[]>,
 *   layoutOpts?: object,
 * }} params
 */
export async function ensureEphemeralAgentCards({
  projectId,
  cards = [],
  fetchBeatAgents = fetchMusicAgents,
  fetchImageAgents = fetchAgents,
  layoutOpts,
} = {}) {
  if (!projectId) {
    return {
      cards,
      restored: { beat: 0, agent: 0 },
      changed: false,
    };
  }

  try {
    const [beatAgents, imageAgents] = await Promise.all([
      fetchBeatAgents(projectId),
      fetchImageAgents(projectId),
    ]);
    return restoreEphemeralAgentCardsFromRecords(
      cards,
      { beatAgents, imageAgents },
      layoutOpts,
    );
  } catch (error) {
    console.warn('ensureEphemeralAgentCards failed:', error?.message ?? error);
    return {
      cards,
      restored: { beat: 0, agent: 0 },
      changed: false,
      error,
    };
  }
}
