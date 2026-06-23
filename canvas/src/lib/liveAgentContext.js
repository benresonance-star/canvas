import { fetchLiveArtifact } from '../features/live/api/liveApi.js';
import { getPinnedVersion } from './agentContextContent.js';
import { normalizeCardType } from './filename.js';

/**
 * @param {object} card
 * @returns {string | null}
 */
export function resolveLiveArtifactId(card) {
  if (!card) return null;
  const pinned = getPinnedVersion(card);
  return card.liveArtifactId ?? pinned?.liveArtifactId ?? pinned?.artifactRef?.id ?? null;
}

/**
 * @param {object} live
 * @returns {string | null}
 */
export function formatLiveFeedForAgent(live) {
  const version = live?.latestVersion;
  if (!version?.markdownBody?.trim()) return null;

  const title = version.title || live?.name || 'Live agent feed';
  const header = [
    `# Live Agent Feed: ${title}`,
    version.reportDate ? `Report date: ${version.reportDate}` : '',
    version.overview ? `Overview: ${version.overview}` : '',
  ].filter(Boolean).join('\n');

  return `${header}\n\n${version.markdownBody.trim()}`;
}

/**
 * @param {object} card
 * @returns {Promise<{ text: string | null, versionId: string | null }>}
 */
export async function fetchLiveFeedContext(card) {
  const liveArtifactId = resolveLiveArtifactId(card);
  if (!liveArtifactId) {
    return { text: null, versionId: null };
  }

  const live = await fetchLiveArtifact(liveArtifactId);
  const version = live?.latestVersion;
  return {
    text: formatLiveFeedForAgent(live),
    versionId: version?.id ?? null,
  };
}

/**
 * Ephemeral copies of live cards with liveCurrentVersionId for registry hashing.
 * @param {object[]} cards
 * @returns {Promise<object[]>}
 */
export async function hydrateLiveContextCards(cards) {
  const liveCards = (cards ?? []).filter((card) => normalizeCardType(card?.type) === 'live');
  if (!liveCards.length) return cards ?? [];

  const versionByCardId = new Map();
  await Promise.all(
    liveCards.map(async (card) => {
      try {
        const liveArtifactId = resolveLiveArtifactId(card);
        if (!liveArtifactId) {
          versionByCardId.set(card.id, 'none');
          return;
        }
        const live = await fetchLiveArtifact(liveArtifactId);
        versionByCardId.set(card.id, live?.latestVersion?.id ?? 'none');
      } catch {
        versionByCardId.set(card.id, 'none');
      }
    }),
  );

  return (cards ?? []).map((card) => {
    if (normalizeCardType(card?.type) !== 'live') return card;
    return {
      ...card,
      liveCurrentVersionId: versionByCardId.get(card.id) ?? 'none',
    };
  });
}
