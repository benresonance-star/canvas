import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { getCardPixelSize, filterCardsForViewport } from '../lib/cards.js';
import { clientToWorldPoint, clampCanvasZoom } from '../lib/canvasView.js';
import { beginCardDragSession, endCardDragSession } from '../lib/cardDragSession.js';
import { beginCanvasInteraction, endCanvasInteraction } from '../lib/canvasInteraction.js';
import { clearStuckPointerHover } from '../lib/clearStuckHover.js';
import { strings } from '../content/strings.js';
import { isCardMissingFromFolder } from '../lib/filename.js';
import { CanvasCard } from './CanvasCard.jsx';
import { CanvasEdgeLayer } from './CanvasEdgeLayer.jsx';
import { ClusterHullLayer } from './ClusterHullLayer.jsx';
import { LinkDropConfirm } from './LinkDropConfirm.jsx';
import {
  createRelationship,
  deleteRelationship,
  deleteNote,
} from '../lib/primitivesApi.js';
import { cardDragIgnoresTarget } from '../lib/canvasLinkDrag.js';
import { computeUserNoteDisabled } from '../lib/filename.js';
import { ensureCardArtifactRef } from '../lib/ensureCardArtifactRef.js';
import { resolveThreadForCard } from '../lib/agentChatThreads.js';
import { buildClusterHulls } from '../lib/graph/clusterHull.js';
import { EMPTY_CLUSTER_HULL_SOURCE } from '../lib/clusterProjectContext.js';
import {
  computeDragPosition,
  computeResizeRect,
} from '../lib/canvasPointerGeometry.js';
import {
  exceedsPanGestureThreshold,
  isCanvasPanModifier,
} from '../lib/canvasPanModifier.js';

export function Canvas({
  state,
  setState,
  cards,
  allCards,
  activeCardId,
  setActiveCardId,
  onOpenCard,
  onPinVersion,
  onUpdateCard,
  onDeleteCard,
  folderKeySet,
  folderConnected,
  versionStackOpen,
  setVersionStackOpen,
  onRehydratePreview,
  onInspectArtifact,
  clusterId,
  canvasEdges = [],
  linkCountByCardId,
  onGraphRefresh,
  folderHandle,
  projectId,
  projectName,
  onPatchCardVersion,
  onInlineSaveUserNote,
  onInlineSaveBookmark,
  savingCardId,
  onLinkDeleteStatus,
  onOpenEdgePrimitive,
  selectedCardIds,
  onToggleCardSelect,
  onClearCardSelection,
  clusterHullSource = EMPTY_CLUSTER_HULL_SOURCE,
  highlightedClusterId = null,
  onSelectCluster,
  onInspectCluster,
  onClearClusterSelection,
  onViewportSizeChange,
  onBatchUpdateCardPositions,
  agentSelectionMode = false,
  onCanvasElementRef,
  stagingDropActive = false,
  onCardDragMove,
  onDockCardToTray,
  onCardDragEnd,
  onInteractionStart,
  onInteractionCommit,
  onCommitCardPosition,
  onCommitCanvasView,
  onAgentChatCardActivate,
  agentChatLiveMessages = null,
  agentChatLiveCardId = null,
  agentChatTranscriptRevision = 0,
  agentChatThreadIndex = null,
  agentChatConnectorId = null,
  readOnly = false,
}) {
  const canvasRef = useRef(null);
  const [panning, setPanning] = useState(false);
  const [panStart, setPanStart] = useState(null);
  const [draggingCard, setDraggingCard] = useState(null);
  const [resizingCard, setResizingCard] = useState(null);
  const [linkDrag, setLinkDrag] = useState(null);
  const [linkDropTarget, setLinkDropTarget] = useState(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [draggingCluster, setDraggingCluster] = useState(null);
  const cardDragEndedRef = useRef(false);
  const resizeEndedRef = useRef(false);
  const panGestureMovedRef = useRef(false);
  const panGestureOriginRef = useRef(null);
  const panningRef = useRef(false);
  const panStartRef = useRef(null);
  const panBaseViewRef = useRef(null);
  const panPreviewRef = useRef(null);
  const panEndedRef = useRef(false);
  const lastPointerClientRef = useRef({ x: 0, y: 0 });
  const draggingCardRef = useRef(null);
  const resizingCardRef = useRef(null);
  const draggingClusterRef = useRef(null);
  const linkDragRef = useRef(null);
  const wheelCommitTimerRef = useRef(null);

  const baseView = state.canvasView;
  const latestCanvasViewRef = useRef(baseView);
  useEffect(() => {
    latestCanvasViewRef.current = baseView;
  }, [baseView]);
  /** @type {[object | null, Function]} */
  const [panPreview, setPanPreview] = useState(null);
  const view = panPreview ?? baseView;
  const cardsForLink = allCards || cards;

  /** @type {[Map<string, { x: number, y: number, width?: number, height?: number }> | null, Function]} */
  const [positionOverrides, setPositionOverrides] = useState(null);
  const positionOverridesRef = useRef(null);
  useEffect(() => {
    positionOverridesRef.current = positionOverrides;
  }, [positionOverrides]);

  const mergedCards = React.useMemo(() => {
    if (!positionOverrides || positionOverrides.size === 0) return cards;
    return cards.map((c) => {
      const o = positionOverrides.get(c.id);
      return o ? { ...c, ...o } : c;
    });
  }, [cards, positionOverrides]);

  const displayCards = React.useMemo(() => {
    const cullDisabled =
      Boolean(draggingCard)
      || Boolean(resizingCard)
      || Boolean(linkDrag)
      || readOnly;
    return filterCardsForViewport(mergedCards, view, viewportSize, {
      disable: cullDisabled,
    });
  }, [mergedCards, view, viewportSize, draggingCard, resizingCard, linkDrag, readOnly]);

  const cardsById = useMemo(
    () => new Map((allCards ?? cards ?? []).map((card) => [card.id, card])),
    [allCards, cards],
  );

  const clusterHulls = React.useMemo(
    () =>
      buildClusterHulls({
        clusters: clusterHullSource.clusters,
        membersByClusterId: clusterHullSource.membersByClusterId,
        cards: mergedCards,
        workspaceClusterId: clusterId,
      }),
    [clusterHullSource, mergedCards, clusterId],
  );

  const setView = useCallback((updater) => {
    setState(prev => ({
      ...prev,
      canvasView: (() => {
        const nextView = typeof updater === 'function' ? updater(prev.canvasView) : updater;
        latestCanvasViewRef.current = nextView;
        return nextView;
      })(),
    }));
  }, [setState]);

  const clientToWorld = useCallback((clientX, clientY) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return clientToWorldPoint(view, rect, clientX, clientY);
  }, [view]);

  const setCanvasRef = useCallback(
    (el) => {
      canvasRef.current = el;
      onCanvasElementRef?.(el);
    },
    [onCanvasElementRef],
  );

  const cardAtWorldPoint = useCallback((wx, wy) => {
    for (let i = cardsForLink.length - 1; i >= 0; i -= 1) {
      const card = cardsForLink[i];
      const { w, h } = getCardPixelSize(card);
      if (wx >= card.x && wx <= card.x + w && wy >= card.y && wy <= card.y + h) {
        return card;
      }
    }
    return null;
  }, [cardsForLink]);

  const endInteraction = useCallback(
    (kind, payload) => {
      onInteractionCommit?.({ kind, ...payload });
    },
    [onInteractionCommit],
  );

  const scheduleViewCommit = useCallback(() => {
    if (wheelCommitTimerRef.current) {
      clearTimeout(wheelCommitTimerRef.current);
    }
    wheelCommitTimerRef.current = setTimeout(() => {
      wheelCommitTimerRef.current = null;
      endInteraction('viewCommit', { canvasView: latestCanvasViewRef.current });
    }, 400);
  }, [endInteraction]);

  const handleWheel = useCallback((e) => {
    if (e.target.closest('[data-artifact-scroll]')) return;

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = -e.deltaY * 0.002;
      const newZoom = clampCanvasZoom(view.zoom * (1 + delta));
      const rect = canvasRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const worldX = (mx - view.x) / view.zoom;
      const worldY = (my - view.y) / view.zoom;
      setView({
        x: mx - worldX * newZoom,
        y: my - worldY * newZoom,
        zoom: newZoom,
      });
      scheduleViewCommit();
    } else {
      e.preventDefault();
      setView(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      scheduleViewCommit();
    }
  }, [view, setView, scheduleViewCommit]);

  useEffect(() => () => {
    if (wheelCommitTimerRef.current) {
      clearTimeout(wheelCommitTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const report = () => {
      const { width, height } = el.getBoundingClientRect();
      setViewportSize({ width, height });
      onViewportSizeChange?.({ width, height });
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onViewportSizeChange]);

  const beginPanGesture = useCallback((e) => {
    const viewAtStart = latestCanvasViewRef.current;
    panEndedRef.current = false;
    panBaseViewRef.current = viewAtStart;
    panGestureMovedRef.current = false;
    panGestureOriginRef.current = { x: e.clientX, y: e.clientY };
    panningRef.current = true;
    panStartRef.current = { x: e.clientX - viewAtStart.x, y: e.clientY - viewAtStart.y };
    panPreviewRef.current = null;
    onInteractionStart?.('pan');
    beginCanvasInteraction('pan');
    setPanning(true);
    setPanStart(panStartRef.current);
    setActiveCardId(null);
    setVersionStackOpen(null);
    if (!agentSelectionMode) {
      onClearCardSelection?.();
      onClearClusterSelection?.();
    }
  }, [
    agentSelectionMode,
    onClearCardSelection,
    onClearClusterSelection,
    onInteractionStart,
    setActiveCardId,
    setVersionStackOpen,
  ]);

  const applyPanPointerMove = useCallback((clientX, clientY) => {
    if (!panningRef.current || !panStartRef.current) return;
    if (exceedsPanGestureThreshold(panGestureOriginRef.current, clientX, clientY)) {
      panGestureMovedRef.current = true;
    }
    const base = panBaseViewRef.current ?? latestCanvasViewRef.current;
    const preview = {
      ...base,
      x: clientX - panStartRef.current.x,
      y: clientY - panStartRef.current.y,
    };
    panPreviewRef.current = preview;
    setPanPreview(preview);
  }, []);

  const finishPanGesture = useCallback(() => {
    if (!panningRef.current || panEndedRef.current) return;
    panEndedRef.current = true;
    const preview = panPreviewRef.current;
    if (preview) {
      onCommitCanvasView?.(preview);
      endInteraction('viewCommit', { canvasView: preview });
    }
    panningRef.current = false;
    panStartRef.current = null;
    panBaseViewRef.current = null;
    panPreviewRef.current = null;
    setPanPreview(null);
    setPanning(false);
    setPanStart(null);
    endCanvasInteraction('pan');
    if (!panGestureMovedRef.current) {
      panGestureOriginRef.current = null;
    }
  }, [endInteraction, onCommitCanvasView]);

  const abortDragForPan = useCallback(() => {
    endCardDragSession(canvasRef.current);
    cardDragEndedRef.current = true;
    resizeEndedRef.current = true;
    draggingCardRef.current = null;
    resizingCardRef.current = null;
    draggingClusterRef.current = null;
    setPositionOverrides(null);
    setDraggingCard(null);
    setResizingCard(null);
    setDraggingCluster(null);
    endCanvasInteraction('card');
    endCanvasInteraction('cluster');
    endCanvasInteraction('resize');
  }, []);

  const onMouseDown = (e) => {
    if (linkDrag) return;
    if (e.target === canvasRef.current || e.target.dataset.canvasBg) {
      beginPanGesture(e);
    }
  };

  const applyCardResizePointerMove = useCallback((clientX, clientY) => {
    if (resizingCard) {
      const { id } = resizingCard;
      const rect = computeResizeRect(resizingCard, clientX, clientY, view.zoom);
      if (!rect) return;
      setPositionOverrides((prev) => {
        const map = new Map(prev ?? []);
        const cur = (cards ?? []).find((c) => c.id === id) ?? {};
        map.set(id, { ...cur, ...rect });
        return map;
      });
    } else if (draggingCard) {
      onCardDragMove?.(clientX, clientY);
      const position = computeDragPosition(draggingCard, clientX, clientY, view.zoom);
      if (!position) return;
      setPositionOverrides((prev) => {
        const map = new Map(prev ?? []);
        map.set(draggingCard.id, position);
        return map;
      });
    }
  }, [resizingCard, draggingCard, view.zoom, onCardDragMove, cards]);

  const applyClusterPointerMove = useCallback((clientX, clientY) => {
    if (!draggingCluster || !onBatchUpdateCardPositions) return;
    const dx = (clientX - draggingCluster.startMouseX) / view.zoom;
    const dy = (clientY - draggingCluster.startMouseY) / view.zoom;
    const updates = [];
    for (const id of draggingCluster.memberCardIds) {
      const start = draggingCluster.startPositions.get(id);
      if (start) {
        updates.push({ id, x: start.x + dx, y: start.y + dy });
      }
    }
    if (updates.length > 0) {
      setPositionOverrides((prev) => {
        const map = new Map(prev ?? []);
        for (const u of updates) {
          map.set(u.id, { x: u.x, y: u.y });
        }
        return map;
      });
    }
  }, [draggingCluster, onBatchUpdateCardPositions, view.zoom]);

  const onMouseMove = (e) => {
    applyPanPointerMove(e.clientX, e.clientY);
  };

  useEffect(() => {
    const onPointerMove = (e) => {
      lastPointerClientRef.current = { x: e.clientX, y: e.clientY };
      applyPanPointerMove(e.clientX, e.clientY);
    };
    window.addEventListener('pointermove', onPointerMove);
    return () => window.removeEventListener('pointermove', onPointerMove);
  }, [applyPanPointerMove]);

  useEffect(() => {
    if (!panning) return undefined;

    const onPointerEnd = (e) => {
      if (e.button !== 0) return;
      if (draggingCardRef.current || resizingCardRef.current || draggingClusterRef.current) return;
      finishPanGesture();
    };

    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    return () => {
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
    };
  }, [panning, finishPanGesture]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'Control' && e.key !== 'Meta') return;
      if (e.repeat) return;
      if (!(e.buttons & 1)) return;
      if (panningRef.current) return;

      const { x, y } = lastPointerClientRef.current;
      if (draggingCardRef.current || resizingCardRef.current || draggingClusterRef.current) {
        abortDragForPan();
        beginPanGesture({ clientX: x, clientY: y });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [abortDragForPan, beginPanGesture]);

  const reportLinkStatus = useCallback(
    (payload) => {
      onLinkDeleteStatus?.(payload);
    },
    [onLinkDeleteStatus],
  );

  const finishLinkDrag = useCallback(
    async (clientX, clientY) => {
      const drag = linkDragRef.current;
      if (!drag) return;
      linkDragRef.current = null;
      setLinkDrag(null);

      const world = clientToWorld(clientX, clientY);
      const target = cardAtWorldPoint(world.x, world.y);
      const sourceCard = cardsForLink.find((c) => c.id === drag.sourceCardId);
      if (!target || !sourceCard || target.id === sourceCard.id) {
        return;
      }

      const linkCtx = { projectId, projectName, folderHandle };

      let sourceRef =
        sourceCard.versions?.find((v) => v.version === sourceCard.pinnedVersion)
        || sourceCard.versions?.[0];
      let targetRef =
        target.versions?.find((v) => v.version === target.pinnedVersion)
        || target.versions?.[0];

      if (!sourceRef?.artifactRef?.id) {
        const ensured = await ensureCardArtifactRef({ ...linkCtx, card: sourceCard });
        if (!ensured.ok) {
          reportLinkStatus({
            error:
              ensured.reason === 'api_unavailable'
                ? strings.sync.primitivesNotUpdated
                : strings.graph.linkNeedsRefs,
          });
          return;
        }
        sourceRef = ensured.version;
        onPatchCardVersion?.(sourceCard.id, sourceRef.version, sourceRef);
      }

      if (!targetRef?.artifactRef?.id) {
        const ensured = await ensureCardArtifactRef({ ...linkCtx, card: target });
        if (!ensured.ok) {
          reportLinkStatus({
            error:
              ensured.reason === 'api_unavailable'
                ? strings.sync.primitivesNotUpdated
                : strings.graph.linkNeedsRefs,
          });
          return;
        }
        targetRef = ensured.version;
        onPatchCardVersion?.(target.id, targetRef.version, targetRef);
      }

      if (sourceRef?.artifactRef?.id && targetRef?.artifactRef?.id) {
        setLinkDropTarget({
          sourceRef: sourceRef.artifactRef,
          targetRef: targetRef.artifactRef,
          targetName: target.name,
        });
      } else {
        reportLinkStatus({ error: strings.graph.linkNeedsRefs });
      }
    },
    [
      cardAtWorldPoint,
      cardsForLink,
      clientToWorld,
      folderHandle,
      onPatchCardVersion,
      projectId,
      projectName,
      reportLinkStatus,
    ],
  );

  const finishCardDrag = useCallback((clientX, clientY, cardId) => {
    if (cardDragEndedRef.current) return;
    cardDragEndedRef.current = true;
    const dragSession =
      draggingCard?.id === cardId
        ? draggingCard
        : draggingCardRef.current?.id === cardId
          ? draggingCardRef.current
          : null;

    const finalPosition =
      dragSession
        ? computeDragPosition(dragSession, clientX, clientY, view.zoom)
        : null;
    const overrides = positionOverridesRef.current;
    const commitDrag = () => {
      const o = finalPosition ?? (cardId && overrides?.get(cardId));
      if (cardId && o) {
        onCommitCardPosition?.(cardId, o.x, o.y);
        endInteraction('layoutCommit', {
          cardUpdates: [{ id: cardId, x: o.x, y: o.y }],
        });
      }
      setPositionOverrides(null);
    };

    if (cardId && onDockCardToTray?.(cardId, clientX, clientY)) {
      setPositionOverrides(null);
      endCardDragSession(canvasRef.current);
      clearStuckPointerHover(clientX, clientY);
      setPanning(false);
      setPanStart(null);
      setDraggingCard(null);
      setResizingCard(null);
      setDraggingCluster(null);
      endCanvasInteraction('card');
      onCardDragEnd?.();
      return;
    }

    commitDrag();
    endCardDragSession(canvasRef.current);
    clearStuckPointerHover(clientX, clientY);
    setPanning(false);
    setPanStart(null);
    draggingCardRef.current = null;
    setDraggingCard(null);
    setResizingCard(null);
    setDraggingCluster(null);
    endCanvasInteraction('card');
    onCardDragEnd?.();
  }, [
    onDockCardToTray,
    onCardDragEnd,
    draggingCard,
    view.zoom,
    onCommitCardPosition,
    endInteraction,
  ]);

  const finishClusterDrag = useCallback(() => {
    const overrides = positionOverridesRef.current;
    if (overrides?.size && onBatchUpdateCardPositions) {
      const updates = [...overrides.entries()].map(([id, pos]) => ({
        id,
        x: pos.x,
        y: pos.y,
      }));
      onBatchUpdateCardPositions(updates);
      endInteraction('layoutCommit', { cardUpdates: updates });
    }
    setPositionOverrides(null);
    draggingClusterRef.current = null;
    setDraggingCluster(null);
    endCanvasInteraction('cluster');
  }, [onBatchUpdateCardPositions, endInteraction]);

  const finishResize = useCallback((clientX = null, clientY = null) => {
    if (resizeEndedRef.current) return;
    resizeEndedRef.current = true;
    const resizeSession = resizingCard ?? resizingCardRef.current;
    const id = resizeSession?.id;
    const finalRect =
      resizeSession && clientX != null && clientY != null
        ? computeResizeRect(resizeSession, clientX, clientY, view.zoom)
        : null;
    const o = finalRect ?? (id && positionOverridesRef.current?.get(id));
    if (id && o) {
      onUpdateCard(id, {
        x: o.x,
        y: o.y,
        width: o.width,
        height: o.height,
      });
      endInteraction('layoutCommit', {
        cardUpdates: [{
          id,
          x: o.x,
          y: o.y,
          width: o.width,
          height: o.height,
        }],
      });
    }
    setPositionOverrides(null);
    resizingCardRef.current = null;
    setResizingCard(null);
    endCanvasInteraction('resize');
  }, [resizingCard, view.zoom, onUpdateCard, endInteraction]);

  const registerImmediatePointerEnd = useCallback((handler) => {
    const onEnd = (e) => {
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      handler(e);
    };
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  }, []);

  const onMouseUp = (e) => {
    if (linkDragRef.current) {
      void finishLinkDrag(e.clientX, e.clientY);
      return;
    }
    if (draggingCluster) {
      finishClusterDrag();
      return;
    }
    if (draggingCard) {
      finishCardDrag(e.clientX, e.clientY, draggingCard.id);
      return;
    }
    if (resizingCard) {
      finishResize(e.clientX, e.clientY);
      return;
    }
    finishPanGesture();
    setDraggingCard(null);
    setResizingCard(null);
    setDraggingCluster(null);
  };

  useEffect(() => {
    linkDragRef.current = linkDrag;
  }, [linkDrag]);

  useEffect(() => {
    if (!linkDrag) return undefined;

    const onMove = (e) => {
      const world = clientToWorld(e.clientX, e.clientY);
      const hover = cardAtWorldPoint(world.x, world.y);
      setLinkDrag((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          toX: world.x,
          toY: world.y,
          active: true,
          hoverCardId: hover?.id ?? null,
        };
      });
    };

    const onEnd = (e) => {
      void finishLinkDrag(e.clientX, e.clientY);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };
  }, [linkDrag, clientToWorld, cardAtWorldPoint, finishLinkDrag]);

  useEffect(() => {
    if (!draggingCard) return undefined;

    const cardId = draggingCard.id;
    const onPointerEnd = (e) => {
      finishCardDrag(e.clientX, e.clientY, cardId);
    };

    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    return () => {
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
    };
  }, [draggingCard, finishCardDrag]);

  useEffect(() => {
    if (!resizingCard) return undefined;

    const onPointerEnd = (e) => {
      finishResize(e.clientX, e.clientY);
    };

    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    return () => {
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
    };
  }, [resizingCard, finishResize]);

  useEffect(() => {
    if (!draggingCard && !resizingCard && !draggingCluster) return undefined;

    const onMove = (e) => {
      if (draggingCluster) {
        applyClusterPointerMove(e.clientX, e.clientY);
      } else {
        applyCardResizePointerMove(e.clientX, e.clientY);
      }
    };

    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [
    draggingCard,
    resizingCard,
    draggingCluster,
    applyCardResizePointerMove,
    applyClusterPointerMove,
  ]);

  const cancelCardDragInteraction = useCallback(() => {
    endCardDragSession(canvasRef.current);
    cardDragEndedRef.current = true;
    resizeEndedRef.current = true;
    draggingCardRef.current = null;
    resizingCardRef.current = null;
    draggingClusterRef.current = null;
    setPositionOverrides(null);
    setPanPreview(null);
    setDraggingCard(null);
    setResizingCard(null);
    setDraggingCluster(null);
    endCanvasInteraction('card');
    endCanvasInteraction('cluster');
    endCanvasInteraction('resize');
    endCanvasInteraction('pan');
    onCardDragEnd?.();
  }, [onCardDragEnd]);

  useEffect(() => {
    if (!readOnly) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        cancelCardDragInteraction();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [readOnly, cancelCardDragInteraction]);

  useEffect(() => () => {
    endCardDragSession(canvasRef.current);
  }, []);

  const startClusterMove = (hull, e) => {
    if (e.button !== 0) return;
    if (isCanvasPanModifier(e)) {
      if (linkDrag) return;
      e.preventDefault();
      beginPanGesture(e);
      return;
    }
    if (readOnly || linkDrag || !hull.memberCardIds?.length) return;
    const cardById = new Map(cards.map((c) => [c.id, c]));
    const startPositions = new Map();
    for (const id of hull.memberCardIds) {
      const card = cardById.get(id);
      if (card) startPositions.set(id, { x: card.x, y: card.y });
    }
    if (startPositions.size === 0) return;
    setPanning(false);
    setPanStart(null);
    onInteractionStart?.('cluster');
    beginCanvasInteraction('cluster');
    setPositionOverrides(new Map());
    setDraggingCluster({
      clusterId: hull.clusterId,
      memberCardIds: hull.memberCardIds,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startPositions,
    });
    draggingClusterRef.current = {
      clusterId: hull.clusterId,
      memberCardIds: hull.memberCardIds,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startPositions,
    };
  };

  const startCardDrag = (e, card) => {
    if (linkDrag || e.button !== 0) return;
    if (isCanvasPanModifier(e)) {
      e.preventDefault();
      beginPanGesture(e);
      return;
    }
    if (readOnly) return;
    if (cardDragIgnoresTarget(e.target)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    cardDragEndedRef.current = false;
    onInteractionStart?.('card');
    beginCanvasInteraction('card');
    beginCardDragSession(canvasRef.current, card.id);
    setPositionOverrides(new Map());
    const session = {
      id: card.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startX: card.x,
      startY: card.y,
    };
    draggingCardRef.current = session;
    setDraggingCard(session);
    registerImmediatePointerEnd((endEvent) => {
      finishCardDrag(endEvent.clientX, endEvent.clientY, card.id);
    });
  };

  const startLinkDrag = (e, card) => {
    if (e.button !== 0) return;
    if (isCanvasPanModifier(e)) {
      if (linkDrag) return;
      e.preventDefault();
      beginPanGesture(e);
      return;
    }
    if (readOnly) return;
    e.stopPropagation();
    e.preventDefault();
    setDraggingCard(null);
    endCardDragSession(canvasRef.current);
    const { w, h } = getCardPixelSize(card);
    const world = clientToWorld(e.clientX, e.clientY);
    const next = {
      sourceCardId: card.id,
      fromX: card.x + w,
      fromY: card.y + h / 2,
      toX: world.x,
      toY: world.y,
      active: true,
      hoverCardId: null,
    };
    linkDragRef.current = next;
    setLinkDrag(next);
  };

  const startResize = (e, card, corner) => {
    if (e.button !== 0) return;
    if (isCanvasPanModifier(e)) {
      if (linkDrag) return;
      e.preventDefault();
      beginPanGesture(e);
      return;
    }
    if (readOnly || linkDrag) return;
    e.stopPropagation();
    e.preventDefault();
    setDraggingCard(null);
    setPanning(false);
    setPanStart(null);
    endCardDragSession(canvasRef.current);
    const { w, h } = getCardPixelSize(card);
    onInteractionStart?.('resize');
    beginCanvasInteraction('resize');
    setPositionOverrides(new Map());
    resizeEndedRef.current = false;
    const session = {
      id: card.id,
      corner,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startX: card.x,
      startY: card.y,
      startW: w,
      startH: h,
    };
    resizingCardRef.current = session;
    setResizingCard(session);
    registerImmediatePointerEnd((endEvent) => {
      finishResize(endEvent.clientX, endEvent.clientY);
    });
  };

  const handleDeleteEdge = useCallback(
    async (edge) => {
      if (!clusterId) return;
      try {
        if (edge.kind === 'relationship') {
          await deleteRelationship(edge.id);
        } else if (edge.kind === 'note_attachment') {
          const noteId = edge.noteId ?? edge.fromId;
          if (!noteId) throw new Error('missing note id');
          await deleteNote(noteId);
        } else {
          return;
        }
        onLinkDeleteStatus?.({ toast: strings.graph.linkDeleted });
        await onGraphRefresh?.();
      } catch {
        const msg =
          edge.kind === 'note_attachment'
            ? strings.graph.noteDeleteFailed
            : strings.graph.linkDeleteFailed;
        onLinkDeleteStatus?.({ error: msg });
      }
    },
    [clusterId, onGraphRefresh, onLinkDeleteStatus],
  );

  const handleLinkConfirm = async (relType) => {
    if (!linkDropTarget) {
      return;
    }
    if (!clusterId) {
      reportLinkStatus({ error: strings.graph.linkNeedsCluster });
      setLinkDropTarget(null);
      return;
    }
    try {
      await createRelationship(
        clusterId,
        {
          from_ref: linkDropTarget.sourceRef,
          to_ref: linkDropTarget.targetRef,
          type: relType,
          provenance: [linkDropTarget.sourceRef],
          metadata: { source: 'ui_canvas_drag' },
        },
        { idempotent: true },
      );
      onGraphRefresh?.();
    } catch {
      reportLinkStatus({ error: strings.graph.linkCreateFailed });
    }
    setLinkDropTarget(null);
  };

  return (
    <div
      ref={setCanvasRef}
      data-canvas-bg
      {...(draggingCard ? { 'data-card-dragging': '' } : {})}
      className={`fixed inset-0 z-0 bg-canvas cursor-grab active:cursor-grabbing select-none${
        stagingDropActive ? ' ring-2 ring-inset ring-accent/40' : ''
      }`}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <div
        className="absolute inset-0 canvas-bg pointer-events-none"
        aria-hidden
        style={{ backgroundPosition: `${Math.round(view.x)}px ${Math.round(view.y)}px` }}
      />
      <div
        className="absolute origin-top-left"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
        }}
      >
        <CanvasEdgeLayer
          variant="paths"
          canvasEdges={canvasEdges}
          linkDrag={linkDrag}
        />
        <ClusterHullLayer
          mode="paths"
          hulls={clusterHulls}
          highlightedClusterId={highlightedClusterId}
          onHullSelect={onSelectCluster}
          onHullDoubleClick={onInspectCluster}
        />
        {displayCards.map(card => (
          <CanvasCard
            key={card.id}
            card={card}
            isActive={activeCardId === card.id}
            isFaded={!cards.find(c => c.id === card.id)}
            zoom={view.zoom}
            missingFromFolder={isCardMissingFromFolder({
              folderConnected,
              folderKeySet,
              card,
            })}
            linkCount={linkCountByCardId?.get(card.id) || 0}
            isLinkDropHighlight={linkDrag?.hoverCardId === card.id}
            canLinkFrom={card.type === 'user_note'}
            isMultiSelected={selectedCardIds?.has(card.id)}
            agentSelectionMode={agentSelectionMode}
            isBeingDragged={draggingCard?.id === card.id}
            onActivate={(e) => {
              if (panGestureMovedRef.current) {
                panGestureMovedRef.current = false;
                panGestureOriginRef.current = null;
                return;
              }

              const threadForCard =
                card.type === 'agent_chat'
                && agentChatConnectorId
                && agentChatThreadIndex
                ? resolveThreadForCard(agentChatThreadIndex, card, agentChatConnectorId)
                : null;

              if (threadForCard) {
                if (agentSelectionMode) {
                  setActiveCardId(card.id);
                  return;
                }
                if (e.shiftKey && onToggleCardSelect) {
                  onToggleCardSelect(card.id);
                  setActiveCardId(card.id);
                  return;
                }
                onClearCardSelection?.();
                setActiveCardId(card.id);
                return;
              }

              if (agentSelectionMode && onToggleCardSelect) {
                onToggleCardSelect(card.id);
                setActiveCardId(card.id);
              } else if (e.shiftKey && onToggleCardSelect) {
                onToggleCardSelect(card.id);
                setActiveCardId(card.id);
              } else {
                onClearCardSelection?.();
                setActiveCardId(card.id);
              }
            }}
            onOpen={() => {
              if (card.type === 'agent_chat' && onAgentChatCardActivate) {
                onAgentChatCardActivate(card);
                return;
              }
              onOpenCard(card.id);
            }}
            onStartDrag={(e) => startCardDrag(e, card)}
            onStartLinkDrag={(e) => startLinkDrag(e, card)}
            onStartResize={startResize}
            onPinVersion={(v) => onPinVersion(card.id, v)}
            onDeleteCard={() => onDeleteCard(card.id)}
            versionStackOpen={versionStackOpen === card.id}
            toggleVersionStack={() => setVersionStackOpen(s => s === card.id ? null : card.id)}
            onRehydratePreview={onRehydratePreview}
            onInspectArtifact={onInspectArtifact}
            onInlineSaveUserNote={
              onInlineSaveUserNote
                ? (payload) => onInlineSaveUserNote(card, payload)
                : undefined
            }
            onInlineSaveBookmark={
              onInlineSaveBookmark
                ? (payload) => onInlineSaveBookmark(card, payload)
                : undefined
            }
            onUpdateCard={onUpdateCard}
            userNoteSaving={savingCardId === card.id}
            bookmarkSaving={savingCardId === card.id}
            agentChatLiveMessages={agentChatLiveMessages}
            agentChatLiveCardId={agentChatLiveCardId}
            agentChatTranscriptRevision={agentChatTranscriptRevision}
            agentChatThreadIndex={agentChatThreadIndex}
            agentChatConnectorId={agentChatConnectorId}
            folderHandle={folderHandle}
            userNoteDisabled={computeUserNoteDisabled({
              folderHandle,
              folderConnected,
              folderKeySet,
              cardKey: card.key,
            })}
            bookmarkEditDisabled={readOnly}
            cardsById={cardsById}
          />
        ))}
        <ClusterHullLayer
          mode="chrome"
          hulls={clusterHulls}
          highlightedClusterId={highlightedClusterId}
          onHullSelect={onSelectCluster}
          onHullDoubleClick={onInspectCluster}
          onStartClusterMove={onBatchUpdateCardPositions ? startClusterMove : undefined}
          zoom={view.zoom}
        />
        <CanvasEdgeLayer
          variant="interactive"
          canvasEdges={canvasEdges}
          linkDrag={linkDrag}
          zoom={view.zoom}
          onDeleteEdge={clusterId ? handleDeleteEdge : undefined}
          onOpenEdgePrimitive={onOpenEdgePrimitive}
        />
      </div>

      {linkDropTarget && (
        <LinkDropConfirm
          targetName={linkDropTarget.targetName}
          onConfirm={(t) => void handleLinkConfirm(t)}
          onCancel={() => setLinkDropTarget(null)}
        />
      )}
    </div>
  );
}
