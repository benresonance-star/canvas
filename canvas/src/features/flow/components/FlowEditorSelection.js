export function resolveFlowNodeClickSelection(currentNodeIds = [], nodeId, additive = false) {
  if (!nodeId) return [...currentNodeIds];
  if (!additive) return [nodeId];
  const next = new Set(currentNodeIds.filter(Boolean));
  if (next.has(nodeId)) {
    next.delete(nodeId);
  } else {
    next.add(nodeId);
  }
  return [...next];
}

export function buildFlowNodeSelectionChanges(nodes = [], selectedNodeIds = []) {
  const selected = new Set(selectedNodeIds.filter(Boolean));
  return nodes
    .filter((node) => Boolean(node.selected) !== selected.has(node.id))
    .map((node) => ({
      id: node.id,
      type: 'select',
      selected: selected.has(node.id),
    }));
}

export function selectionsHaveSameNodeIds(left = [], right = []) {
  const leftIds = new Set(left.filter(Boolean));
  const rightIds = new Set(right.filter(Boolean));
  if (leftIds.size !== rightIds.size) return false;
  return [...leftIds].every((id) => rightIds.has(id));
}
