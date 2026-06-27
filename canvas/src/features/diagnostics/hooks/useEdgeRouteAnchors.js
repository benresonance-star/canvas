import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'canvas-diagnostics-edge-anchors';

function readStoredAnchors() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function useEdgeRouteAnchors() {
  const [routeAnchors, setRouteAnchors] = useState(readStoredAnchors);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(routeAnchors));
  }, [routeAnchors]);

  const setRouteAnchor = useCallback((edgeId, anchor) => {
    setRouteAnchors((prev) => {
      if (!anchor) {
        if (!prev[edgeId]) return prev;
        const next = { ...prev };
        delete next[edgeId];
        return next;
      }
      return { ...prev, [edgeId]: { x: anchor.x, y: anchor.y } };
    });
  }, []);

  const resetRouteAnchors = useCallback(() => {
    setRouteAnchors({});
  }, []);

  return { routeAnchors, setRouteAnchor, resetRouteAnchors };
}
