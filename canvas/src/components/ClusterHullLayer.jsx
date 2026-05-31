import React from 'react';
import { GripHorizontal } from 'lucide-react';
import { strings } from '../content/strings.js';
import {
  CLUSTER_CHROME_GAP,
  CLUSTER_CHROME_HANDLE_SCREEN_PX,
  CLUSTER_CHROME_ICON_SCREEN_PX,
  CLUSTER_CHROME_LABEL_MIN_ZOOM,
  CLUSTER_CHROME_ROW_HEIGHT,
} from '../lib/graph/clusterHull.js';

export function ClusterHullLayer({
  hulls = [],
  highlightedClusterId = null,
  onHullSelect,
  onHullDoubleClick,
  onStartClusterMove,
  zoom = 1,
  mode = 'all',
}) {
  if (!hulls.length) return null;

  const showPaths = mode === 'all' || mode === 'paths';
  const showChromeLayer =
    (mode === 'all' || mode === 'chrome') &&
    (onStartClusterMove || onHullSelect || onHullDoubleClick);

  const showChromeForHull = (clusterId) =>
    showChromeLayer && (zoom >= CLUSTER_CHROME_LABEL_MIN_ZOOM || highlightedClusterId === clusterId);

  const showClusterLabel = zoom >= CLUSTER_CHROME_LABEL_MIN_ZOOM;
  const handleWorldPx = CLUSTER_CHROME_HANDLE_SCREEN_PX / zoom;
  const iconWorldPx = CLUSTER_CHROME_ICON_SCREEN_PX / zoom;

  return (
    <>
      {showPaths && (
      <svg
        className="absolute left-0 top-0 overflow-visible pointer-events-none"
        style={{ width: 1, height: 1 }}
        aria-hidden={!onHullSelect && !onHullDoubleClick}
      >
        {hulls.map((hull) => {
          const isActive = highlightedClusterId === hull.clusterId;
          return (
            <path
              key={hull.clusterId}
              d={hull.pathD}
              className={`cluster-hull-path${
                hull.depth > 0 ? ' cluster-hull-path--nested' : ''
              }${isActive ? ' cluster-hull-path--active' : ''}${
                onHullSelect || onHullDoubleClick ? ' pointer-events-auto cursor-pointer' : ''
              }`}
              strokeWidth={isActive ? 2 : 1.5}
              vectorEffect="non-scaling-stroke"
              onClick={
                onHullSelect
                  ? (e) => {
                      e.stopPropagation();
                      onHullSelect(hull.clusterId);
                    }
                  : undefined
              }
              onDoubleClick={
                onHullDoubleClick
                  ? (e) => {
                      e.stopPropagation();
                      onHullDoubleClick(hull.clusterId);
                    }
                  : undefined
              }
            />
          );
        })}
      </svg>
      )}
      {showChromeLayer &&
        hulls.map((hull) => {
          const isActive = highlightedClusterId === hull.clusterId;
          if (!showChromeForHull(hull.clusterId)) return null;

          const gapWorld = CLUSTER_CHROME_GAP / zoom;
          const chromeTop =
            hull.handleY - Math.max(0, handleWorldPx - CLUSTER_CHROME_ROW_HEIGHT);

          return (
            <div
              key={`${hull.clusterId}-chrome`}
              className="absolute flex items-center pointer-events-auto"
              style={{
                left: hull.centerX,
                top: chromeTop,
                height: handleWorldPx,
                gap: gapWorld,
                transform: 'translateX(-50%)',
              }}
            >
              {onStartClusterMove && (
                <button
                  type="button"
                  title={strings.cluster.moveHandle}
                  aria-label={strings.cluster.moveHandle}
                  className={`flex items-center justify-center rounded-md bg-surface border border-border shadow-sm text-secondary hover:text-primary hover:border-accent/50 cursor-move shrink-0 ${
                    isActive ? 'ring-1 ring-accent/50' : ''
                  }`}
                  style={{ width: handleWorldPx, height: handleWorldPx }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onStartClusterMove(hull, e);
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <GripHorizontal size={iconWorldPx} strokeWidth={1.5} />
                </button>
              )}
              {showClusterLabel && (onHullSelect || onHullDoubleClick) && (
                <button
                  type="button"
                  title={hull.name}
                  aria-label={strings.cluster.canvasLabel(hull.name)}
                  className={`sans uppercase tracking-wider whitespace-nowrap rounded-full px-2 py-0.5 bg-surface/90 backdrop-blur border border-border text-secondary hover:text-primary hover:border-accent/40 cursor-pointer shrink-0 ${
                    isActive ? 'ring-1 ring-accent/40 text-primary' : ''
                  }`}
                  style={{
                    fontSize: 10 / zoom,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onHullSelect?.(hull.clusterId);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onHullDoubleClick?.(hull.clusterId);
                  }}
                >
                  {hull.name}
                </button>
              )}
            </div>
          );
        })}
    </>
  );
}
