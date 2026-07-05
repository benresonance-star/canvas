import React from 'react';
import { BimStylePresetsMenu } from './BimStylePresetsMenu.jsx';
import { ClaySliderControl, WireframeHiddenLinesToggle } from './bimStyleHudControls.jsx';
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
  CLAY_LIGHT_INTENSITY_MIN,
  CLAY_LIGHT_INTENSITY_MAX,
  WIREFRAME_LINE_WEIGHT_MIN,
  WIREFRAME_LINE_WEIGHT_MAX,
} from '../bim-core/types.js';

export function BimStyleSettingsHud({
  renderStyle = 'standard',
  wireframeMode = false,
  viewportBackgroundColor,
  onViewportBackgroundChange,
  clayAoIntensity,
  clayAoRadius,
  clayAoBias,
  clayAoDistance,
  clayAoSamples,
  clayAoResolution,
  clayLightIntensity,
  claySurfaceColor,
  clayGlassOpacity,
  onClayStyleChange,
  wireframeLineWeight,
  wireframeOpacity,
  wireframeColor,
  wireframeHiddenLines,
  onWireframeStyleChange,
  projectId,
  cardId,
  artifactId,
  styleSettings,
  onApplyStyleSettings,
}) {
  const isClay = renderStyle === 'clay';
  const showWireframe = wireframeMode;

  return (
    <div
      className="pointer-events-auto w-full rounded-md border border-border bg-surface/95 p-2.5 shadow-lg backdrop-blur-sm"
      aria-label="Style settings"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider text-muted">Style settings</div>
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            value={viewportBackgroundColor}
            onChange={(event) => onViewportBackgroundChange(event.target.value)}
            title="Viewport background colour"
            aria-label="Viewport background colour"
            className="h-6 w-6 cursor-pointer rounded border border-border bg-surface p-0.5"
          />
          <BimStylePresetsMenu
            projectId={projectId}
            cardId={cardId}
            artifactId={artifactId}
            styleSettings={styleSettings}
            onApplyStyleSettings={onApplyStyleSettings}
          />
        </div>
      </div>

      {isClay ? (
        <div className="flex flex-col gap-1.5 border-t border-border pt-2 mt-2" aria-label="Clay style controls">
          <ClaySliderControl
            label="AO"
            value={clayAoIntensity}
            min={CLAY_AO_INTENSITY_MIN}
            max={CLAY_AO_INTENSITY_MAX}
            step={1}
            formatKind="aoIntensity"
            title="AO strength — darker crevice shading"
            ariaLabel="Clay AO intensity"
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
            onChange={(event) => onClayStyleChange({ clayGlassOpacity: Number(event.target.value) })}
          />
          <label className="flex items-center gap-2 text-[10px] text-secondary" title="Clay surface colour">
            <span className="w-7 shrink-0 text-muted uppercase tracking-wider">Surf</span>
            <input
              type="color"
              value={claySurfaceColor}
              onChange={(event) => onClayStyleChange({ claySurfaceColor: event.target.value })}
              aria-label="Clay surface colour"
              className="h-6 w-6 cursor-pointer rounded border border-border bg-surface p-0.5"
            />
          </label>
        </div>
      ) : null}

      {showWireframe ? (
        <div className={`flex flex-col gap-1.5 ${isClay ? '' : 'border-t border-border pt-2 mt-2'}`} aria-label="Wireframe style controls">
          <ClaySliderControl
            label="Wt"
            value={wireframeLineWeight}
            min={WIREFRAME_LINE_WEIGHT_MIN}
            max={WIREFRAME_LINE_WEIGHT_MAX}
            step={0.25}
            formatKind="lineWeight"
            title="Wireframe line weight"
            ariaLabel="Wireframe line weight"
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
            onChange={(event) => onWireframeStyleChange({
              wireframeOpacity: wireframeLineOpacityFromTransparency(Number(event.target.value), {
                denseEdges: !wireframeHiddenLines,
              }),
            })}
          />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-[10px] text-secondary" title="Wireframe colour">
              <span className="w-7 shrink-0 text-muted uppercase tracking-wider">Line</span>
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
        </div>
      ) : null}
    </div>
  );
}
