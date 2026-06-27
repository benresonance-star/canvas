import {
  Bot,
  Cog,
  UserRound,
  Wrench,
} from 'lucide-react';

/** @typedef {'human' | 'agent' | 'process' | 'tool'} FlowNodeActorId */

/** @type {ReadonlyArray<{ id: FlowNodeActorId, label: string, icon: import('react').ComponentType<{ size?: number, className?: string, strokeWidth?: number }> }>} */
export const FLOW_NODE_ACTORS = Object.freeze([
  { id: 'human', label: 'Human', icon: UserRound },
  { id: 'agent', label: 'Agent', icon: Bot },
  { id: 'process', label: 'Process', icon: Cog },
  { id: 'tool', label: 'Tool', icon: Wrench },
]);

const FLOW_NODE_ACTOR_IDS = new Set(FLOW_NODE_ACTORS.map((entry) => entry.id));

/**
 * @param {unknown} value
 * @returns {FlowNodeActorId[]}
 */
export function normalizeFlowNodeActors(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const normalized = [];
  for (const item of value) {
    if (typeof item !== 'string' || !FLOW_NODE_ACTOR_IDS.has(item) || seen.has(item)) continue;
    seen.add(item);
    normalized.push(/** @type {FlowNodeActorId} */ (item));
  }
  return normalized;
}

/**
 * @param {unknown} actors
 * @param {FlowNodeActorId} actorId
 */
export function toggleFlowNodeActor(actors, actorId) {
  if (!FLOW_NODE_ACTOR_IDS.has(actorId)) return normalizeFlowNodeActors(actors);
  const current = normalizeFlowNodeActors(actors);
  if (current.includes(actorId)) {
    return current.filter((id) => id !== actorId);
  }
  return [...current, actorId];
}

/**
 * @param {FlowNodeActorId} actorId
 */
export function flowNodeActorMeta(actorId) {
  return FLOW_NODE_ACTORS.find((entry) => entry.id === actorId) ?? null;
}

/**
 * @param {unknown} actors
 */
export function flowNodeActorMetas(actors) {
  const normalized = new Set(normalizeFlowNodeActors(actors));
  return FLOW_NODE_ACTORS.filter((entry) => normalized.has(entry.id));
}
