import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cardTypeLabel } from '../lib/filename.js';
import { clientToWorldPoint, isPointInRect } from '../lib/canvasView.js';
import { getStagingColorForType } from '../lib/stagingColors.js';
import { groupStagedCardsByType } from '../lib/syncStaging.js';
import { strings } from '../content/strings.js';

/** Staged chip diameter — 75% of the original 20px circles. */
const STAGING_CHIP_SIZE_PX = 15;

function StagingChip({ staged, isDraggingThis, onPointerDown, onHover }) {
  const color = getStagingColorForType(staged.type);
  const typeLabel = cardTypeLabel(staged.type);

  return (
    <button
      type="button"
      aria-label={strings.syncHolding.chipAria(staged.name, typeLabel)}
      className={`shrink-0 rounded-full border border-white/20 shadow-md transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-grab active:cursor-grabbing touch-none ${
        isDraggingThis ? 'opacity-30' : ''
      }`}
      style={{
        backgroundColor: color,
        width: STAGING_CHIP_SIZE_PX,
        height: STAGING_CHIP_SIZE_PX,
      }}
      onMouseEnter={onHover}
      onFocus={onHover}
      onBlur={() => onHover(null)}
      onPointerDown={(e) => onPointerDown(e, staged)}
    />
  );
}

export function SyncHoldingTray({
  stagedCards,
  canvasView,
  canvasElement,
  onPlace,
  onDragActiveChange,
  visible = false,
  dropZoneHighlight = false,
  onDropZoneRectChange,
}) {
  const [dragging, setDragging] = useState(null);
  const [hoveredStagingId, setHoveredStagingId] = useState(null);
  const dragRef = useRef(null);
  const endedRef = useRef(false);
  const dropZoneRef = useRef(null);

  const typeGroups = useMemo(
    () => groupStagedCardsByType(stagedCards),
    [stagedCards],
  );

  const reportDropZone = useCallback(() => {
    const el = dropZoneRef.current;
    if (!el || !onDropZoneRectChange) return;
    const r = el.getBoundingClientRect();
    onDropZoneRectChange({
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
    });
  }, [onDropZoneRectChange]);

  useLayoutEffect(() => {
    if (stagedCards.length === 0 && !visible) {
      onDropZoneRectChange?.(null);
      return undefined;
    }
    reportDropZone();
    const el = dropZoneRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => reportDropZone());
    ro.observe(el);
    window.addEventListener('resize', reportDropZone);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', reportDropZone);
    };
  }, [visible, stagedCards.length, typeGroups.length, reportDropZone, onDropZoneRectChange]);

  const hoveredStaged = stagedCards.find(
    (s) => s.stagingId === hoveredStagingId,
  );
  const hoverLabel =
    hoveredStaged && !dragging
      ? (hoveredStaged.folderPath || hoveredStaged.relativePath || hoveredStaged.name)
      : null;

  const endDrag = useCallback(
    (clientX, clientY) => {
      if (endedRef.current) return;
      endedRef.current = true;

      const session = dragRef.current;
      dragRef.current = null;
      setDragging(null);

      onDragActiveChange?.(false);

      if (!session || !canvasElement) return;

      const rect = canvasElement.getBoundingClientRect();
      if (!isPointInRect(clientX, clientY, rect)) return;

      const world = clientToWorldPoint(canvasView, rect, clientX, clientY);
      onPlace(session.stagingId, world.x, world.y);
    },
    [canvasElement, canvasView, onPlace, onDragActiveChange],
  );

  useEffect(() => {
    if (!dragging) return undefined;

    const onMove = (e) => {
      if (dragRef.current) {
        dragRef.current = {
          ...dragRef.current,
          clientX: e.clientX,
          clientY: e.clientY,
        };
        setDragging((d) =>
          d ? { ...d, clientX: e.clientX, clientY: e.clientY } : null,
        );
      }
    };

    const onUp = (e) => {
      const captureTarget = dragRef.current?.captureTarget;
      if (
        captureTarget instanceof Element
        && captureTarget.hasPointerCapture(e.pointerId)
      ) {
        captureTarget.releasePointerCapture(e.pointerId);
      }
      endDrag(e.clientX, e.clientY);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, endDrag]);

  const onChipPointerDown = useCallback((e, staged) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    endedRef.current = false;
    const color = getStagingColorForType(staged.type);
    const session = {
      stagingId: staged.stagingId,
      name: staged.name,
      type: staged.type,
      color,
      clientX: e.clientX,
      clientY: e.clientY,
      captureTarget: e.currentTarget,
      pointerId: e.pointerId,
    };
    dragRef.current = session;
    setDragging(session);
    setHoveredStagingId(null);
    onDragActiveChange?.(true);
  }, [onDragActiveChange]);

  if (stagedCards.length === 0 && !visible) return null;

  const isEmpty = stagedCards.length === 0;

  return (
    <>
      <div
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-auto flex flex-col items-center w-max max-w-[calc(100vw-2rem)]"
        role="region"
        aria-label={strings.syncHolding.trayLabel}
      >
        <div className="relative flex flex-col items-center">
          {hoverLabel && (
            <span
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 sans text-[9px] text-primary leading-tight text-center whitespace-nowrap pointer-events-none"
              aria-hidden
            >
              {hoverLabel}
            </span>
          )}
          <div
            ref={dropZoneRef}
            className={`flex items-end justify-center flex-nowrap gap-2 px-2 py-1.5 bg-surface/90 backdrop-blur border transition-all w-max ${
              dropZoneHighlight
                ? 'border-accent ring-2 ring-accent/50 scale-[1.02]'
                : 'border-border'
            } ${isEmpty ? 'rounded-full min-w-[4.5rem] min-h-[1.75rem]' : 'rounded-xl'}`}
            onMouseLeave={() => setHoveredStagingId(null)}
          >
            {isEmpty ? (
              <span className="sans text-[9px] text-muted px-1 pointer-events-none">
                {strings.syncHolding.emptyTrayDrop}
              </span>
            ) : (
              typeGroups.map((group, groupIndex) => (
                <div
                  key={group.type}
                  className={`flex flex-col items-center gap-[5px] shrink-0 ${
                    groupIndex > 0
                      ? 'pl-2 border-l border-border/60'
                      : ''
                  }`}
                >
                  <div className="flex items-center justify-center gap-1 flex-nowrap">
                    {group.cards.map((staged) => (
                      <StagingChip
                        key={staged.stagingId}
                        staged={staged}
                        isDraggingThis={
                          dragging?.stagingId === staged.stagingId
                        }
                        onPointerDown={onChipPointerDown}
                        onHover={() => setHoveredStagingId(staged.stagingId)}
                      />
                    ))}
                  </div>
                  <span className="sans text-[8px] uppercase tracking-wider text-muted leading-none pointer-events-none">
                    {cardTypeLabel(group.type)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
        {!isEmpty && (
          <p className="sans text-[9px] text-muted text-center mt-1.5 pointer-events-none">
            {strings.syncHolding.dragHint}
          </p>
        )}
      </div>

      {dragging && (
        <div
          className="fixed z-[60] rounded-full border border-white/30 shadow-lg pointer-events-none"
          style={{
            backgroundColor: dragging.color,
            width: STAGING_CHIP_SIZE_PX,
            height: STAGING_CHIP_SIZE_PX,
            left: dragging.clientX,
            top: dragging.clientY,
            transform: 'translate(-50%, -50%)',
          }}
          aria-hidden
        />
      )}
    </>
  );
}
