export function buildFlowNeighborhoodFocus({ nodes = [], edges = [], selectedNodeIds = [] } = {}) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const selectedIds = new Set(selectedNodeIds.filter((id) => nodeIds.has(id)));

  if (!selectedIds.size) {
    return {
      active: false,
      selectedIds,
      visibleNodeIds: new Set(),
      ghostedNodeIds: new Set(),
      activeEdgeIds: new Set(),
      ghostedEdgeIds: new Set(),
    };
  }

  const visibleNodeIds = new Set(selectedIds);
  const activeEdgeIds = new Set();
  const ghostedEdgeIds = new Set();

  edges.forEach((edge) => {
    const sourceSelected = selectedIds.has(edge.source);
    const targetSelected = selectedIds.has(edge.target);

    if (sourceSelected && nodeIds.has(edge.target)) visibleNodeIds.add(edge.target);
    if (targetSelected && nodeIds.has(edge.source)) visibleNodeIds.add(edge.source);
  });

  edges.forEach((edge) => {
    const directlyTouchesSelection = selectedIds.has(edge.source) || selectedIds.has(edge.target);
    const fullyVisible = visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target);
    if (directlyTouchesSelection && fullyVisible) {
      activeEdgeIds.add(edge.id);
    } else {
      ghostedEdgeIds.add(edge.id);
    }
  });

  return {
    active: true,
    selectedIds,
    visibleNodeIds,
    ghostedNodeIds: new Set(nodes.filter((node) => !visibleNodeIds.has(node.id)).map((node) => node.id)),
    activeEdgeIds,
    ghostedEdgeIds,
  };
}

export function buildGhostedFlowPathIds(paths = [], visibleNodeIds = new Set()) {
  if (!visibleNodeIds.size) return new Set();
  return new Set(
    paths
      .filter((path) => !(path.stepIds ?? []).some((stepId) => visibleNodeIds.has(stepId)))
      .map((path) => path.id),
  );
}
