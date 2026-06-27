import React from 'react';
import { GripHorizontal } from 'lucide-react';
import { strings } from '../../../content/strings.js';
import {
  CLUSTER_CHROME_GAP,
  CLUSTER_CHROME_HANDLE_SCREEN_PX,
  CLUSTER_CHROME_ICON_SCREEN_PX,
  CLUSTER_CHROME_LABEL_MIN_ZOOM,
  CLUSTER_CHROME_ROW_HEIGHT,
} from '../../../lib/graph/clusterHull.js';

export function FlowPathHullLayer({
  hulls = [],
  highlightedPathId = null,
  onHullSelect,
  onStartPathMove,
  zoom = 1,
  readOnly = false,
}) {
  if (!hulls.length) return null;

  const showChromeForHull = (pathId) =>
    zoom >= CLUSTER_CHROME_LABEL_MIN_ZOOM || highlightedPathId === pathId;

  const showPathLabel = zoom >= CLUSTER_CHROME_LABEL_MIN_ZOOM;
  const handleWorldPx = CLUSTER_CHROME_HANDLE_SCREEN_PX / zoom;
  const iconWorldPx = CLUSTER_CHROME_ICON_SCREEN_PX / zoom;
  const currentStepFontSize = 9 / zoom;
  const currentStepRowHeight = showPathLabel ? currentStepFontSize + 8 / zoom : 0;

  return (
    <>
      <svg
        className="flow-path-hull-layer flow-path-hull-layer--paths absolute left-0 top-0 overflow-visible"
        style={{ width: 1, height: 1 }}
        aria-hidden={!onHullSelect}
      >
        {hulls.map((hull) => {
          const isActive = highlightedPathId === hull.pathId;
          return (
            <path
              key={hull.pathId}
              d={hull.pathD}
              className={`flow-path-hull-path${isActive ? ' flow-path-hull-path--active' : ''}${
                onHullSelect ? ' pointer-events-auto cursor-pointer' : ''
              }`}
              onPointerDown={
                onHullSelect
                  ? (e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onHullSelect(hull.pathId);
                    }
                  : undefined
              }
            />
          );
        })}
      </svg>
      {hulls.map((hull) => {
        const isActive = highlightedPathId === hull.pathId;
        if (!showChromeForHull(hull.pathId)) return null;

        const gapWorld = CLUSTER_CHROME_GAP / zoom;
        const chromeTop =
          hull.handleY - Math.max(0, handleWorldPx - CLUSTER_CHROME_ROW_HEIGHT) - currentStepRowHeight;
        const currentStepTitle = hull.currentStepTitle ?? strings.flow.pathCurrentActiveStepNone;

        return (
          <div
            key={`${hull.pathId}-chrome`}
            className="flow-path-hull-layer flow-path-hull-layer--chrome absolute flex flex-col items-center pointer-events-auto"
            style={{
              left: hull.centerX,
              top: chromeTop,
              gap: 2 / zoom,
              transform: 'translateX(-50%)',
            }}
          >
            <div
              className="flex items-center"
              style={{
                height: handleWorldPx,
                gap: gapWorld,
              }}
            >
              {onStartPathMove && !readOnly && (
                <button
                  type="button"
                  title={strings.flow.pathMoveHandle}
                  aria-label={strings.flow.pathMoveHandle}
                  className={`flex items-center justify-center rounded-md bg-surface border border-border shadow-sm text-secondary hover:text-primary hover:border-accent/50 cursor-move shrink-0 ${
                    isActive ? 'ring-1 ring-accent/50' : ''
                  }`}
                  style={{ width: handleWorldPx, height: handleWorldPx }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onStartPathMove(hull, e);
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <GripHorizontal size={iconWorldPx} strokeWidth={1.5} />
                </button>
              )}
              {showPathLabel && onHullSelect && (
                <button
                  type="button"
                  title={hull.name}
                  aria-label={strings.flow.pathCanvasLabel(hull.name)}
                  className={`sans uppercase tracking-wider whitespace-nowrap rounded-full px-2 py-0.5 bg-surface/90 backdrop-blur border border-border text-secondary hover:text-primary hover:border-accent/40 cursor-pointer shrink-0 ${
                    isActive ? 'ring-1 ring-accent/40 text-primary' : ''
                  }`}
                  style={{
                    fontSize: 10 / zoom,
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onHullSelect(hull.pathId);
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {hull.name}
                </button>
              )}
            </div>
            {showPathLabel && (
              <div
                className={`sans uppercase tracking-wider whitespace-nowrap rounded-full px-2 py-0.5 bg-surface/90 backdrop-blur border border-border shrink-0 ${
                  hull.currentStepTitle ? 'text-primary' : 'text-muted'
                }`}
                style={{ fontSize: currentStepFontSize }}
              >
                {strings.flow.pathCanvasCurrentStep} {currentStepTitle}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
