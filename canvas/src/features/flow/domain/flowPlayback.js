import { flowEdgeEffectiveEndpoints } from './flowDocument.js';

function nodePosition(nodeMap, id) {
  const node = nodeMap.get(id);
  return {
    x: Number(node?.position?.x ?? 0),
    y: Number(node?.position?.y ?? 0),
  };
}

function orderPlaybackStepIds(stepIds, edges = [], nodeMap = new Map()) {
  const members = [...new Set(stepIds ?? [])];
  if (members.length <= 1) return members;

  const memberSet = new Set(members);
  const outgoing = new Map(members.map((id) => [id, []]));
  const incomingCount = new Map(members.map((id) => [id, 0]));

  for (const edge of edges ?? []) {
    const { from, to } = flowEdgeEffectiveEndpoints(edge);
    if (!from || !to || from === to || !memberSet.has(from) || !memberSet.has(to)) continue;
    outgoing.get(from).push(to);
    incomingCount.set(to, (incomingCount.get(to) ?? 0) + 1);
  }

  const compareIds = (a, b) => {
    const pa = nodePosition(nodeMap, a);
    const pb = nodePosition(nodeMap, b);
    if (pa.x !== pb.x) return pa.x - pb.x;
    if (pa.y !== pb.y) return pa.y - pb.y;
    return members.indexOf(a) - members.indexOf(b);
  };

  const ready = members.filter((id) => (incomingCount.get(id) ?? 0) === 0).sort(compareIds);
  const ordered = [];
  const visited = new Set();

  while (ready.length) {
    const current = ready.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    ordered.push(current);

    for (const next of [...(outgoing.get(current) ?? [])].sort(compareIds)) {
      if (visited.has(next)) continue;
      incomingCount.set(next, Math.max(0, (incomingCount.get(next) ?? 0) - 1));
      if ((incomingCount.get(next) ?? 0) === 0) {
        ready.push(next);
        ready.sort(compareIds);
      }
    }
  }

  return [
    ...ordered,
    ...members.filter((id) => !visited.has(id)).sort(compareIds),
  ];
}

export function buildFlowPlaybackSequence({
  paths = [],
  nodes = [],
  edges = [],
  nodesById = null,
  selectedPathId = null,
  selectedNodeId = null,
} = {}) {
  const nodeMap = nodesById instanceof Map
    ? nodesById
    : new Map(nodes.map((node) => [node.id, node]));
  const validNodeIds = new Set(nodes.map((node) => node.id));
  const path = paths.find((candidate) => candidate.id === selectedPathId)
    ?? paths.find((candidate) => candidate.stepIds?.includes(selectedNodeId))
    ?? paths[0]
    ?? null;
  const rawStepIds = path?.stepIds?.length
    ? path.stepIds
    : nodes.map((node) => node.id);
  const stepIds = orderPlaybackStepIds(
    rawStepIds.filter((id) => validNodeIds.has(id)),
    edges,
    nodeMap,
  );

  return {
    pathId: path?.id ?? null,
    pathName: path?.name ?? null,
    stepIds,
  };
}

export function nextFlowPlaybackIndex(currentIndex, stepCount) {
  if (stepCount <= 0) return { index: 0, complete: true };
  if (currentIndex == null || currentIndex < 0) return { index: 0, complete: stepCount === 1 };
  const nextIndex = Math.min(currentIndex + 1, stepCount - 1);
  return { index: nextIndex, complete: nextIndex >= stepCount - 1 };
}
