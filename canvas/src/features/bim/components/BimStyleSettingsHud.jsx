import React from 'react';
import { BimStyleHudSharedControls, BimStyleToolbarSliders } from './BimStyleToolbarControls.jsx';

export function BimStyleSettingsHud({
  renderStyle = 'standard',
  viewportBackgroundColor,
  onViewportBackgroundChange,
  showEnvironment = false,
  environmentPreset,
  onToggleLighting,
  projectId,
  cardId,
  artifactId,
  styleSettings,
  onApplyStyleSettings,
  ...sliderProps
}) {
  return (
    <div
      className="pointer-events-auto w-full overflow-visible rounded-md border border-border bg-surface/95 p-2.5 shadow-lg backdrop-blur-sm"
      aria-label="Style settings panel"
    >
      <div className="mb-2 text-[10px] uppercase tracking-wider text-muted">Style settings</div>
      <BimStyleHudSharedControls
        renderStyle={renderStyle}
        viewportBackgroundColor={viewportBackgroundColor}
        onViewportBackgroundChange={onViewportBackgroundChange}
        showEnvironment={showEnvironment}
        environmentPreset={environmentPreset}
        onToggleLighting={onToggleLighting}
        projectId={projectId}
        cardId={cardId}
        artifactId={artifactId}
        styleSettings={styleSettings}
        onApplyStyleSettings={onApplyStyleSettings}
      />
      <div className="max-h-[min(50vh,20rem)] overflow-y-auto overflow-x-hidden pr-0.5">
        <BimStyleToolbarSliders renderStyle={renderStyle} {...sliderProps} layout="panel" />
      </div>
    </div>
  );
}
