import React from 'react';
import { SunMedium } from 'lucide-react';
import { BimStylePresetsMenu } from './BimStylePresetsMenu.jsx';
import { BimClayDebugPanel } from './BimClayDebugPanel.jsx';
import { ClaySliderControl, WireframeHiddenLinesToggle } from './bimStyleHudControls.jsx';
import { bimLightingToolbarLabel } from '../bim-core/bimLighting.js';
import {
  wireframeLineOpacityFromTransparency,
  wireframeTransparencyFromLineOpacity,
  CLAY_AO_BIAS_MIN,
  CLAY_AO_BIAS_MAX,
  CLAY_AO_DISTANCE_MIN,
  CLAY_AO_DISTANCE_MAX,
  CLAY_AO_INTENSITY_MIN,
  CLAY_AO_INTENSITY_MAX,
  CLAY_AO_RADIUS_MIN,
  CLAY_AO_RADIUS_MAX,
  CLAY_AO_RESOLUTION_MIN,
  CLAY_AO_RESOLUTION_MAX,
  CLAY_AO_SAMPLES_MIN,
  CLAY_AO_SAMPLES_MAX,
  CLAY_GLASS_OPACITY_MIN,
  CLAY_GLASS_OPACITY_MAX,
  CLAY_ORIGINAL_COLOR_BLEND_MIN,
  CLAY_ORIGINAL_COLOR_BLEND_MAX,
  CLAY_LIGHT_INTENSITY_MIN,
  CLAY_LIGHT_INTENSITY_MAX,
  WIREFRAME_LINE_WEIGHT_MIN,
  WIREFRAME_LINE_WEIGHT_MAX,
} from '../bim-core/types.js';

export function BimStyleHudSharedControls({
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
}) {
  const showHdriLighting = renderStyle !== 'clay';

  return (
    <div className="mb-2 flex flex-col gap-2 border-b border-border pb-2">
      <label className="flex items-center justify-between gap-2 text-[10px] text-secondary" title="Viewport background colour">
        <span className="uppercase tracking-wider text-muted">Background</span>
        <input
          type="color"
          value={viewportBackgroundColor}
          onChange={(event) => onViewportBackgroundChange(event.target.value)}
          aria-label="Viewport background colour"
          className="h-6 w-6 cursor-pointer rounded border border-border bg-surface p-0.5"
        />
      </label>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted">Presets</span>
        <BimStylePresetsMenu
          projectId={projectId}
          cardId={cardId}
          artifactId={artifactId}
          styleSettings={styleSettings}
          onApplyStyleSettings={onApplyStyleSettings}
        />
      </div>
      {showHdriLighting ? (
        <button
          type="button"
          title={bimLightingToolbarLabel({ showEnvironment, environmentPreset })}
          onClick={onToggleLighting}
          className={`flex items-center justify-between gap-2 rounded border border-border px-2 py-1 text-[10px] ${
            showEnvironment ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-surface-muted'
          }`}
        >
          <span className="inline-flex items-center gap-1.5 uppercase tracking-wider">
            <SunMedium size={12} strokeWidth={1.7} />
            Lighting
          </span>
          <span className="text-muted normal-case">{bimLightingToolbarLabel({ showEnvironment, environmentPreset }).replace(/^Lighting:\s*/, '')}</span>
        </button>
      ) : null}
    </div>
  );
}

/** @deprecated Use BimStyleHudSharedControls in the settings HUD */
export function BimStyleToolbarHeader(props) {
  return (
    <div className="flex shrink-0 items-center gap-1.5" aria-label="Style settings">
      <span className="text-[10px] uppercase tracking-wider text-muted">Style</span>
      <input
        type="color"
        value={props.viewportBackgroundColor}
        onChange={(event) => props.onViewportBackgroundChange(event.target.value)}
        title="Viewport background colour"
        aria-label="Viewport background colour"
        className="h-6 w-6 cursor-pointer rounded border border-border bg-surface p-0.5"
      />
      <BimStylePresetsMenu
        projectId={props.projectId}
        cardId={props.cardId}
        artifactId={props.artifactId}
        styleSettings={props.styleSettings}
        onApplyStyleSettings={props.onApplyStyleSettings}
      />
    </div>
  );
}

export function BimStyleToolbarSliders({
  renderStyle = 'standard',
  wireframeMode = false,
  layout = 'toolbar',
  clayAoIntensity,
  clayAoRadius,
  clayAoBias,
  clayAoDistance,
  clayAoSamples,
  clayAoResolution,
  clayLightIntensity,
  claySurfaceColor,
  clayGlassOpacity,
  clayOriginalColorBlend,
  onClayStyleChange,
  wireframeLineWeight,
  wireframeOpacity,
  wireframeColor,
  wireframeHiddenLines,
  onWireframeStyleChange,
}) {
  const isClay = renderStyle === 'clay';
  const showWireframe = wireframeMode;
  const isPanel = layout === 'panel';
  if (!isClay && !showWireframe) {
    if (!isPanel) return null;
    return (
      <div className="text-[10px] text-muted">
        Enable clay or wireframe for style sliders.
      </div>
    );
  }

  const containerClassName = isPanel
    ? 'flex flex-col gap-1.5'
    : 'flex flex-wrap items-center gap-x-3 gap-y-1.5';
  const clayGroupClassName = isPanel
    ? 'flex flex-col gap-1.5 border-t border-border pt-2 mt-2'
    : 'flex min-w-0 flex-1 items-center gap-x-3 gap-y-1 overflow-x-auto';
  const wireframeGroupClassName = isPanel
    ? `flex flex-col gap-1.5 ${isClay ? '' : 'border-t border-border pt-2 mt-2'}`
    : 'flex shrink-0 items-center gap-x-3 gap-y-1';
  const sliderClassName = isPanel ? 'w-full flex-1 min-w-0' : 'w-[4.5rem] min-w-0';

  const sliders = (
    <div className={containerClassName}>
      {isClay ? (
        <div className={isPanel && !showWireframe ? 'flex flex-col gap-1.5' : clayGroupClassName} aria-label="Clay style controls">
            <ClaySliderControl
              label="AO"
              value={clayAoIntensity}
              min={CLAY_AO_INTENSITY_MIN}
              max={CLAY_AO_INTENSITY_MAX}
              step={1}
              formatKind="aoIntensity"
              title="AO strength — darker crevice shading"
              ariaLabel="Clay AO intensity"
              sliderClassName={sliderClassName}
              onChange={(event) => onClayStyleChange({ clayAoIntensity: Number(event.target.value) })}
            />
            <ClaySliderControl
              label="R"
              value={clayAoRadius}
              min={CLAY_AO_RADIUS_MIN}
              max={CLAY_AO_RADIUS_MAX}
              step={0.0005}
              formatKind="aoRadius"
              title="AO sample radius — wider soft shadows"
              ariaLabel="Clay AO radius"
              sliderClassName={sliderClassName}
              onChange={(event) => onClayStyleChange({ clayAoRadius: Number(event.target.value) })}
            />
            <ClaySliderControl
              label="B"
              value={clayAoBias}
              min={CLAY_AO_BIAS_MIN}
              max={CLAY_AO_BIAS_MAX}
              step={0.01}
              formatKind="aoBias"
              valueClassName="min-w-[2.5rem]"
              title="AO bias — tighter crevice detection"
              ariaLabel="Clay AO bias"
              sliderClassName={sliderClassName}
              onChange={(event) => onClayStyleChange({ clayAoBias: Number(event.target.value) })}
            />
            <ClaySliderControl
              label="D"
              value={clayAoDistance}
              min={CLAY_AO_DISTANCE_MIN}
              max={CLAY_AO_DISTANCE_MAX}
              step={0.01}
              formatKind="aoDistance"
              title="AO distance — depth span of contact shadows"
              ariaLabel="Clay AO distance"
              sliderClassName={sliderClassName}
              onChange={(event) => onClayStyleChange({ clayAoDistance: Number(event.target.value) })}
            />
            <ClaySliderControl
              label="Smp"
              value={clayAoSamples}
              min={CLAY_AO_SAMPLES_MIN}
              max={CLAY_AO_SAMPLES_MAX}
              step={4}
              formatKind="aoSamples"
              title="AO sample count — more samples reduce noise but cost performance"
              ariaLabel="Clay AO sample count"
              sliderClassName={sliderClassName}
              onChange={(event) => onClayStyleChange({ clayAoSamples: Number(event.target.value) })}
            />
            <ClaySliderControl
              label="Res"
              value={clayAoResolution}
              min={CLAY_AO_RESOLUTION_MIN}
              max={CLAY_AO_RESOLUTION_MAX}
              step={0.05}
              formatKind="aoResolution"
              title="AO buffer resolution — lower is faster, higher is sharper"
              ariaLabel="Clay AO resolution"
              sliderClassName={sliderClassName}
              onChange={(event) => onClayStyleChange({ clayAoResolution: Number(event.target.value) })}
            />
            <ClaySliderControl
              label="Lit"
              value={clayLightIntensity}
              min={CLAY_LIGHT_INTENSITY_MIN}
              max={CLAY_LIGHT_INTENSITY_MAX}
              step={0.1}
              formatKind="lightIntensity"
              title="Skylight fill — lower lets AO read stronger"
              ariaLabel="Clay light intensity"
              sliderClassName={sliderClassName}
              onChange={(event) => onClayStyleChange({ clayLightIntensity: Number(event.target.value) })}
            />
            <ClaySliderControl
              label="Gls"
              value={clayGlassOpacity}
              min={CLAY_GLASS_OPACITY_MIN}
              max={CLAY_GLASS_OPACITY_MAX}
              step={0.01}
              formatKind="glassOpacity"
              title="Glazing opacity"
              ariaLabel="Clay glass opacity"
              sliderClassName={sliderClassName}
              onChange={(event) => onClayStyleChange({ clayGlassOpacity: Number(event.target.value) })}
            />
            <ClaySliderControl
              label="Orig"
              value={clayOriginalColorBlend}
              min={CLAY_ORIGINAL_COLOR_BLEND_MIN}
              max={CLAY_ORIGINAL_COLOR_BLEND_MAX}
              step={0.01}
              formatKind="originalColorBlend"
              title="Surface material blend — 0% restores native IFC colours, 100% applies uniform Surf colour and glazing opacity"
              ariaLabel="Clay surface material blend"
              sliderClassName={sliderClassName}
              onChange={(event) => onClayStyleChange({ clayOriginalColorBlend: Number(event.target.value) })}
            />
            <label className="flex shrink-0 items-center gap-1.5 text-[10px] text-secondary" title="Clay surface colour">
              <span className="text-muted uppercase tracking-wider">Surf</span>
              <input
                type="color"
                value={claySurfaceColor}
                onChange={(event) => onClayStyleChange({ claySurfaceColor: event.target.value })}
                aria-label="Clay surface colour"
                className="h-6 w-6 cursor-pointer rounded border border-border bg-surface p-0.5"
              />
            </label>
            {isPanel ? (
              <BimClayDebugPanel
                clayOriginalColorBlend={clayOriginalColorBlend}
                claySurfaceColor={claySurfaceColor}
              />
            ) : null}
          </div>
        ) : null}

        {showWireframe ? (
          <div className={wireframeGroupClassName} aria-label="Wireframe style controls">
            <ClaySliderControl
              label="Wt"
              value={wireframeLineWeight}
              min={WIREFRAME_LINE_WEIGHT_MIN}
              max={WIREFRAME_LINE_WEIGHT_MAX}
              step={0.25}
              formatKind="lineWeight"
              title="Wireframe line weight"
              ariaLabel="Wireframe line weight"
              sliderClassName={sliderClassName}
              onChange={(event) => onWireframeStyleChange({
                wireframeLineWeight: Number(event.target.value),
              })}
            />
            <ClaySliderControl
              label="Trn"
              value={wireframeTransparencyFromLineOpacity(wireframeOpacity, {
                denseEdges: !wireframeHiddenLines,
              })}
              min={0}
              max={1}
              step={0.05}
              formatKind="wireframeTransparency"
              title="Wireframe transparency — 100% shows base render only, 0% shows solid outlines"
              ariaLabel="Wireframe transparency"
              sliderClassName={sliderClassName}
              onChange={(event) => onWireframeStyleChange({
                wireframeOpacity: wireframeLineOpacityFromTransparency(Number(event.target.value), {
                  denseEdges: !wireframeHiddenLines,
                }),
              })}
            />
            <label className="flex shrink-0 items-center gap-1.5 text-[10px] text-secondary" title="Wireframe colour">
              <span className="text-muted uppercase tracking-wider">Line</span>
              <input
                type="color"
                value={wireframeColor}
                onChange={(event) => onWireframeStyleChange({ wireframeColor: event.target.value })}
                aria-label="Wireframe colour"
                className="h-6 w-6 cursor-pointer rounded border border-border bg-surface p-0.5"
              />
            </label>
            <WireframeHiddenLinesToggle
              hiddenLines={wireframeHiddenLines}
              onChange={onWireframeStyleChange}
            />
          </div>
        ) : null}
    </div>
  );

  if (isPanel) return sliders;

  return (
    <div className="shrink-0 border-t border-border bg-surface px-3 py-1.5">
      {sliders}
      {isClay ? (
        <BimClayDebugPanel
          clayOriginalColorBlend={clayOriginalColorBlend}
          claySurfaceColor={claySurfaceColor}
        />
      ) : null}
    </div>
  );
}

export function BimStyleToolbarControls(props) {
  return (
    <>
      <BimStyleToolbarHeader
        viewportBackgroundColor={props.viewportBackgroundColor}
        onViewportBackgroundChange={props.onViewportBackgroundChange}
        projectId={props.projectId}
        cardId={props.cardId}
        artifactId={props.artifactId}
        styleSettings={props.styleSettings}
        onApplyStyleSettings={props.onApplyStyleSettings}
      />
      <BimStyleToolbarSliders
        renderStyle={props.renderStyle}
        wireframeMode={props.wireframeMode}
        clayAoIntensity={props.clayAoIntensity}
        clayAoRadius={props.clayAoRadius}
        clayAoBias={props.clayAoBias}
        clayAoDistance={props.clayAoDistance}
        clayAoSamples={props.clayAoSamples}
        clayAoResolution={props.clayAoResolution}
        clayLightIntensity={props.clayLightIntensity}
        claySurfaceColor={props.claySurfaceColor}
        clayGlassOpacity={props.clayGlassOpacity}
        clayOriginalColorBlend={props.clayOriginalColorBlend}
        onClayStyleChange={props.onClayStyleChange}
        wireframeLineWeight={props.wireframeLineWeight}
        wireframeOpacity={props.wireframeOpacity}
        wireframeColor={props.wireframeColor}
        wireframeHiddenLines={props.wireframeHiddenLines}
        onWireframeStyleChange={props.onWireframeStyleChange}
      />
    </>
  );
}
