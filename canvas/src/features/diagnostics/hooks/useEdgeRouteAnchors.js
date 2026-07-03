import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'canvas-diagnostics-edge-anchors';
const PERSIST_DEBOUNCE_MS = 250;

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

function anchorsEqual(left, right) {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.x === right.x && left.y === right.y;
}

export function useEdgeRouteAnchors() {
  const [routeAnchors, setRouteAnchors] = useState(readStoredAnchors);
  const routeAnchorsRef = useRef(routeAnchors);
  const persistTimerRef = useRef(null);

  routeAnchorsRef.current = routeAnchors;

  const persistAnchors = useCallback((anchors) => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(anchors));
  }, []);

  const schedulePersist = useCallback((anchors) => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = setTimeout(() => {
      persistAnchors(anchors);
      persistTimerRef.current = null;
    }, PERSIST_DEBOUNCE_MS);
  }, [persistAnchors]);

  useEffect(() => () => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }
  }, []);

  const setRouteAnchor = useCallback((edgeId, anchor) => {
    setRouteAnchors((prev) => {
      if (!anchor) {
        if (!prev[edgeId]) return prev;
        const next = { ...prev };
        delete next[edgeId];
        schedulePersist(next);
        return next;
      }
      const existing = prev[edgeId];
      if (anchorsEqual(existing, anchor)) return prev;
      const next = { ...prev, [edgeId]: { x: anchor.x, y: anchor.y } };
      schedulePersist(next);
      return next;
    });
  }, [schedulePersist]);

  const flushRouteAnchors = useCallback(() => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    persistAnchors(routeAnchorsRef.current);
  }, [persistAnchors]);

  const resetRouteAnchors = useCallback(() => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    setRouteAnchors({});
    persistAnchors({});
  }, [persistAnchors]);

  return { routeAnchors, setRouteAnchor, resetRouteAnchors, flushRouteAnchors };
}
