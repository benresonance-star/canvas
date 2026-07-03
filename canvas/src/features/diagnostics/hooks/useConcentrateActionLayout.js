import { useCallback, useEffect, useRef, useState } from 'react';
import { ARCHITECTURE_SPEC_VERSION } from '../../../lib/systemArchitectureSpec.js';
import {
  anchorsEqual,
  centersEqual,
  emptyConcentrateActionLayout,
  flushConcentrateLayoutPersist,
  hydrateConcentrateLayoutFromServer,
  readCachedConcentrateLayout,
  sanitizeConcentrateLayout,
  scheduleConcentrateLayoutPersist,
} from '../../../lib/diagnosticsConcentrateLayoutPersistence.js';

/**
 * @typedef {{ centerX: number, centerY: number }} ConcentrateNodeFlowPosition
 * @typedef {{ x: number, y: number }} ConcentrateEdgeAnchor
 */

/**
 * @param {string | null | undefined} actionId
 * @param {import('../../lib/architecture/architectureGraphSchema.js').ArchitectureActionDef | null | undefined} action
 */
export function useConcentrateActionLayout(actionId, action) {
  const specVersion = ARCHITECTURE_SPEC_VERSION;
  const actionRef = useRef(action);
  actionRef.current = action;

  const [layout, setLayout] = useState(() => {
    if (!actionId) {
      return emptyConcentrateActionLayout('', specVersion);
    }
    return readCachedConcentrateLayout(actionId, specVersion)
      ?? emptyConcentrateActionLayout(actionId, specVersion);
  });

  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  useEffect(() => {
    if (!actionId) {
      setLayout(emptyConcentrateActionLayout('', specVersion));
      return;
    }

    const cached = readCachedConcentrateLayout(actionId, specVersion);
    const initial = sanitizeConcentrateLayout(
      actionRef.current,
      cached ?? emptyConcentrateActionLayout(actionId, specVersion),
    );
    setLayout(initial);
    layoutRef.current = initial;

    let cancelled = false;
    void hydrateConcentrateLayoutFromServer(actionId, specVersion, actionRef.current).then((remote) => {
      if (cancelled || !remote) return;
      const sanitized = sanitizeConcentrateLayout(actionRef.current, remote);
      setLayout(sanitized);
      layoutRef.current = sanitized;
    });

    return () => {
      cancelled = true;
      flushConcentrateLayoutPersist(actionId, specVersion, layoutRef.current);
    };
  }, [actionId, specVersion]);

  const persistLayout = useCallback((next) => {
    layoutRef.current = next;
    setLayout(next);
    scheduleConcentrateLayoutPersist(next, actionRef.current);
  }, []);

  const setNodeFlowCenter = useCallback((nodeId, center) => {
    const current = layoutRef.current;
    if (!actionId || current.actionId !== actionId) return;
    const existing = current.nodeOverrides[nodeId];
    if (centersEqual(existing, center)) return;

    persistLayout({
      ...current,
      nodeOverrides: { ...current.nodeOverrides, [nodeId]: { centerX: center.centerX, centerY: center.centerY } },
      updatedAt: new Date().toISOString(),
    });
  }, [actionId, persistLayout]);

  const setEdgeAnchor = useCallback((edgeId, anchor) => {
    const current = layoutRef.current;
    if (!actionId || current.actionId !== actionId) return;

    if (!anchor) {
      if (!current.edgeAnchors[edgeId]) return;
      const nextAnchors = { ...current.edgeAnchors };
      delete nextAnchors[edgeId];
      persistLayout({
        ...current,
        edgeAnchors: nextAnchors,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    const existing = current.edgeAnchors[edgeId];
    if (anchorsEqual(existing, anchor)) return;

    persistLayout({
      ...current,
      edgeAnchors: { ...current.edgeAnchors, [edgeId]: { x: anchor.x, y: anchor.y } },
      updatedAt: new Date().toISOString(),
    });
  }, [actionId, persistLayout]);

  const flushLayout = useCallback(() => {
    if (!actionId) return;
    flushConcentrateLayoutPersist(actionId, specVersion, layoutRef.current);
  }, [actionId, specVersion]);

  return {
    nodeOverrides: layout.nodeOverrides,
    edgeAnchors: layout.edgeAnchors,
    setNodeFlowCenter,
    setEdgeAnchor,
    flushLayout,
  };
}
