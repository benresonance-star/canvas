import { cardLabel } from './agentContext.js';
import {
  buildContextAddApiContent,
  buildContextDocuments,
  getPinnedVersion,
} from './agentContextContent.js';

/**
 * @param {object} card
 */
export function getCardContentHash(card) {
  const pinned = getPinnedVersion(card);
  if (!pinned) return '';
  if (pinned.content_hash) return String(pinned.content_hash);
  if (pinned.artifactRef?.id) return String(pinned.artifactRef.id);
  return `v${pinned.version ?? 1}`;
}

/**
 * @param {object} card
 */
export function buildCardContextKey(card) {
  return `${card.id}:${getCardContentHash(card)}`;
}

/**
 * @typedef {{ cardId: string, contentHash: string, label: string, key: string }} RegistryEntry
 */

/**
 * @returns {{ keys: Set<string>, byCardId: Map<string, RegistryEntry> }}
 */
export function createContextRegistry() {
  return { keys: new Set(), byCardId: new Map() };
}

/**
 * @param {{ keys: Set<string>, byCardId: Map<string, RegistryEntry> }} registry
 * @param {object} card
 */
export function registerContextCard(registry, card) {
  const key = buildCardContextKey(card);
  const entry = {
    cardId: card.id,
    contentHash: getCardContentHash(card),
    label: cardLabel(card),
    key,
  };
  registry.keys.add(key);
  registry.byCardId.set(card.id, entry);
}

/**
 * @param {{ keys: Set<string>, byCardId: Map<string, RegistryEntry> }} registry
 * @param {string} cardId
 */
export function unregisterContextCard(registry, cardId) {
  const entry = registry.byCardId.get(cardId);
  if (!entry) return;
  registry.keys.delete(entry.key);
  registry.byCardId.delete(cardId);
}

/**
 * @param {{ keys: Set<string>, byCardId: Map<string, RegistryEntry> }} registry
 * @param {object[]} currentCards
 */
export function diffContextRegistry(registry, currentCards) {
  const added = [];
  const stable = [];
  const removed = [];

  const currentIds = new Set(currentCards.map((c) => c.id));

  for (const card of currentCards) {
    const key = buildCardContextKey(card);
    const prev = registry.byCardId.get(card.id);
    if (registry.keys.has(key)) {
      stable.push(card);
    } else if (prev && prev.key !== key) {
      removed.push({ cardId: card.id, label: prev.label, key: prev.key });
      added.push(card);
    } else {
      added.push(card);
    }
  }

  for (const [cardId, entry] of registry.byCardId) {
    if (!currentIds.has(cardId)) {
      removed.push({ cardId, label: entry.label, key: entry.key });
    }
  }

  return { added, removed, stable };
}

/**
 * @param {{ keys: Set<string>, byCardId: Map<string, RegistryEntry> }} registry
 * @param {object[]} currentCards
 */
export function computeContextDeliveryState(registry, currentCards) {
  const { added, removed, stable } = diffContextRegistry(registry, currentCards);
  const pendingRemove = removed.filter((r) => registry.byCardId.has(r.cardId));
  return {
    sentKeys: new Set(registry.keys),
    pendingAdd: added,
    pendingRemove,
    stable,
  };
}

/**
 * @param {object} card
 * @param {{ keys: Set<string>, byCardId: Map<string, RegistryEntry> }} registry
 * @param {{ folderLinked?: boolean }} [options]
 * @returns {'sent_to_ai' | 'sends_on_next' | 'updated_resend' | 'unsupported' | 'needs_folder' | 'empty' | 'pending_remove'}
 */
export function getContextDeliveryStatus(card, registry, options = {}) {
  const { folderLinked = false } = options;
  const key = buildCardContextKey(card);
  const prev = registry.byCardId.get(card.id);
  const pinned = getPinnedVersion(card);

  if (!pinned) return 'empty';

  const type = card.type;
  if (type === 'pdf' && !folderLinked) return 'needs_folder';
  if (type === 'image' && !folderLinked && !pinned.previewCacheKey) return 'needs_folder';

  if (registry.keys.has(key)) return 'sent_to_ai';
  if (prev && prev.key !== key) return 'updated_resend';
  return 'sends_on_next';
}

/**
 * @param {object} msg
 */
export function chatMessageToApiPayload(msg) {
  if (Array.isArray(msg.apiContent) && msg.apiContent.length > 0) {
    return { role: msg.role, content: msg.apiContent };
  }
  return { role: msg.role, content: String(msg.content ?? '') };
}

/**
 * @param {object} msg
 * @param {{ cards?: object[], folderHandle?: FileSystemDirectoryHandle | null, contextMode?: 'selected' | 'visible', profile?: string }} hydrate
 */
export async function hydrateContextAddMessage(msg, hydrate = {}) {
  if (msg.apiContent?.length) return msg;
  if (msg.kind !== 'context_add' || !msg.cardIds?.length) return msg;

  const cards = hydrate.cards ?? [];
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const toLoad = msg.cardIds.map((id) => cardById.get(id)).filter(Boolean);
  if (!toLoad.length) return msg;

  const documents = await buildContextDocuments(toLoad, {
    folderHandle: hydrate.folderHandle ?? null,
    profile: hydrate.profile ?? 'standard',
  });
  const mode = msg.contextMode ?? hydrate.contextMode ?? 'selected';
  return {
    ...msg,
    apiContent: buildContextAddApiContent(mode, documents),
  };
}

/**
 * @param {object[]} messages
 * @param {{
 *   cards?: object[],
 *   folderHandle?: FileSystemDirectoryHandle | null,
 *   contextMode?: 'selected' | 'visible',
 *   profile?: string,
 * }} [hydrate]
 */
export async function buildApiMessageHistoryAsync(messages, hydrate = {}) {
  const out = [];
  for (const msg of messages) {
    if (msg.kind === 'context_add' && !msg.apiContent && msg.cardIds?.length) {
      out.push(await hydrateContextAddMessage(msg, hydrate));
    } else {
      out.push(msg);
    }
  }
  return out.map(chatMessageToApiPayload);
}

/**
 * @param {object[]} messages
 */
export function buildApiMessageHistory(messages) {
  return messages.map(chatMessageToApiPayload);
}

/**
 * Strip apiContent before persisting chat sessions (avoid base64 in localStorage).
 * @param {object[]} messages
 */
export function stripApiContentForStorage(messages) {
  return messages.map((m) => {
    if (!m.apiContent) return m;
    const { apiContent, ...rest } = m;
    return rest;
  });
}
