import React from 'react';
import { strings } from '../../../content/strings.js';
import {
  ReactFlowFitViewIcon,
  ReactFlowZoomInIcon,
  ReactFlowZoomOutIcon,
} from './reactFlowControlIcons.jsx';

/**
 * @param {object} props
 * @param {() => void} props.onZoomIn
 * @param {() => void} props.onZoomOut
 * @param {() => void} props.onFitView
 * @param {boolean} [props.disabled]
 */
export function DiagnosticsWebGLZoomControls({
  onZoomIn,
  onZoomOut,
  onFitView,
  disabled = false,
}) {
  return (
    <div className="diagnostics-canvas-zoom-controls react-flow__controls react-flow__panel bottom left">
      <button
        type="button"
        className="react-flow__controls-button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onZoomIn}
        disabled={disabled}
        title={strings.diagnostics.zoomIn}
        aria-label={strings.diagnostics.zoomIn}
      >
        <ReactFlowZoomInIcon />
      </button>
      <button
        type="button"
        className="react-flow__controls-button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onZoomOut}
        disabled={disabled}
        title={strings.diagnostics.zoomOut}
        aria-label={strings.diagnostics.zoomOut}
      >
        <ReactFlowZoomOutIcon />
      </button>
      <button
        type="button"
        className="react-flow__controls-button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onFitView}
        disabled={disabled}
        title={strings.diagnostics.fitViewTitle}
        aria-label={strings.diagnostics.fitView}
      >
        <ReactFlowFitViewIcon />
      </button>
    </div>
  );
}
