import React, { useMemo } from 'react';
import { SunMedium } from 'lucide-react';
import {
  BIM_SUN_STUDY_CONTROL_MODES,
  BIM_SUN_STUDY_SHADOW_QUALITIES,
  buildSunStudyReadout,
  normalizeBimEnvironmentalAnalysisState,
  patchBimEnvironmentalAnalysisState,
} from '../bim-core/bimSunStudy.js';

function FieldLabel({ children }) {
  return (
    <span className="text-[10px] uppercase tracking-wider text-muted">
      {children}
    </span>
  );
}

function NumericField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled = false,
  suffix = '',
}) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-secondary">
      <FieldLabel>{label}</FieldLabel>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-7 min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1 font-mono text-[11px] text-secondary outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50"
      />
      {suffix ? <span className="w-6 shrink-0 text-[10px] text-muted">{suffix}</span> : null}
    </label>
  );
}

function ToggleRow({ checked, onChange, label, disabled = false }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 rounded px-1 py-0.5 text-[11px] text-secondary hover:bg-surface-muted">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-accent disabled:cursor-not-allowed"
      />
    </label>
  );
}

export function BimSunStudyHud({
  environmentalAnalysis,
  onEnvironmentalAnalysisChange,
}) {
  const state = useMemo(
    () => normalizeBimEnvironmentalAnalysisState(environmentalAnalysis),
    [environmentalAnalysis],
  );
  const { site, sunStudy } = state;
  const readout = useMemo(() => buildSunStudyReadout(state), [state]);
  const disabled = sunStudy.enabled !== true;

  const patchState = (patch) => {
    onEnvironmentalAnalysisChange(patchBimEnvironmentalAnalysisState(state, patch));
  };

  const patchSunStudy = (patch) => {
    patchState({ sunStudy: patch });
  };

  const patchSite = (patch) => {
    patchState({ site: patch });
  };

  const patchManual = (patch) => {
    patchSunStudy({ manual: patch });
  };

  const patchGeo = (patch) => {
    patchSunStudy({ geo: patch });
  };

  const patchAnimation = (patch) => {
    patchSunStudy({ animation: patch });
  };

  return (
    <div
      className="pointer-events-auto w-[19rem] max-w-[calc(100vw-2rem)] rounded-md border border-border bg-surface/95 p-2.5 text-xs shadow-lg backdrop-blur-sm"
      aria-label="Sun study"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
          <SunMedium size={12} strokeWidth={1.8} aria-hidden />
          <span className="text-secondary">Sun study</span>
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-secondary">
          <input
            type="checkbox"
            checked={sunStudy.enabled}
            onChange={(event) => patchSunStudy({ enabled: event.target.checked })}
            className="accent-accent"
            aria-label={sunStudy.enabled ? 'Disable sun study' : 'Enable sun study'}
          />
          <span>{sunStudy.enabled ? 'On' : 'Off'}</span>
        </label>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-1">
          {BIM_SUN_STUDY_CONTROL_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => patchSunStudy({ controlMode: mode })}
              disabled={disabled}
              className={`rounded border border-border px-2 py-1 text-[10px] uppercase tracking-wider ${
                sunStudy.controlMode === mode
                  ? 'bg-accent text-on-accent'
                  : 'text-secondary hover:bg-surface-muted'
              } disabled:cursor-not-allowed disabled:opacity-50`}
              aria-pressed={sunStudy.controlMode === mode}
            >
              {mode}
            </button>
          ))}
        </div>

        {sunStudy.controlMode === 'manual' ? (
          <section className={`space-y-2 ${disabled ? 'opacity-60' : ''}`}>
            <NumericField
              label="Azimuth"
              value={sunStudy.manual.azimuthDeg}
              min={0}
              max={360}
              onChange={(azimuthDeg) => patchManual({ azimuthDeg })}
              disabled={disabled}
              suffix="deg"
            />
            <NumericField
              label="Elev."
              value={sunStudy.manual.elevationDeg}
              min={-5}
              max={90}
              onChange={(elevationDeg) => patchManual({ elevationDeg })}
              disabled={disabled}
              suffix="deg"
            />
          </section>
        ) : (
          <section className={`space-y-2 ${disabled ? 'opacity-60' : ''}`}>
            <NumericField
              label="Lat"
              value={site.latitude}
              min={-90}
              max={90}
              step={0.0001}
              onChange={(latitude) => patchSite({ latitude })}
              disabled={disabled}
            />
            <NumericField
              label="Lon"
              value={site.longitude}
              min={-180}
              max={180}
              step={0.0001}
              onChange={(longitude) => patchSite({ longitude })}
              disabled={disabled}
            />
            <label className="flex flex-col gap-1 text-[11px] text-secondary">
              <FieldLabel>Timezone</FieldLabel>
              <input
                type="text"
                value={site.timezone}
                disabled={disabled}
                onChange={(event) => patchSite({ timezone: event.target.value })}
                className="h-7 rounded border border-border bg-surface px-2 py-1 font-mono text-[11px] text-secondary outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-secondary">
              <FieldLabel>Date / time</FieldLabel>
              <input
                type="datetime-local"
                value={sunStudy.geo.dateTimeLocal}
                disabled={disabled}
                onChange={(event) => patchGeo({ dateTimeLocal: event.target.value })}
                className="h-7 rounded border border-border bg-surface px-2 py-1 font-mono text-[11px] text-secondary outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>
            <ToggleRow
              checked={site.daylightSavingTime}
              onChange={(daylightSavingTime) => patchSite({ daylightSavingTime })}
              label="Daylight saving"
              disabled={disabled}
            />
          </section>
        )}

        <section className={`space-y-2 border-t border-border pt-2 ${disabled ? 'opacity-60' : ''}`}>
          <NumericField
            label="North"
            value={site.trueNorthOffsetDeg}
            min={-180}
            max={180}
            onChange={(trueNorthOffsetDeg) => patchSite({ trueNorthOffsetDeg })}
            disabled={disabled}
            suffix="deg"
          />
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <ToggleRow
              checked={sunStudy.shadowsEnabled}
              onChange={(shadowsEnabled) => patchSunStudy({ shadowsEnabled })}
              label="Shadows"
              disabled={disabled}
            />
            <ToggleRow
              checked={sunStudy.showSkyDome}
              onChange={(showSkyDome) => patchSunStudy({ showSkyDome })}
              label="Sky"
              disabled={disabled}
            />
            <ToggleRow
              checked={sunStudy.showSunTracker}
              onChange={(showSunTracker) => patchSunStudy({ showSunTracker })}
              label="Tracker"
              disabled={disabled}
            />
            {sunStudy.controlMode === 'geo' && (
              <>
                <ToggleRow
                  checked={sunStudy.showSunPath}
                  onChange={(showSunPath) => patchSunStudy({ showSunPath })}
                  label="Path"
                  disabled={disabled}
                />
                <ToggleRow
                  checked={sunStudy.showCompass}
                  onChange={(showCompass) => patchSunStudy({ showCompass })}
                  label="Compass"
                  disabled={disabled || !sunStudy.showSunPath}
                />
              </>
            )}
            <ToggleRow
              checked={sunStudy.groundReceiverEnabled}
              onChange={(groundReceiverEnabled) => patchSunStudy({ groundReceiverEnabled })}
              label="Ground"
              disabled={disabled}
            />
            <ToggleRow
              checked={sunStudy.animation.enabled}
              onChange={(enabled) => patchAnimation({ enabled })}
              label="Animate"
              disabled={disabled || sunStudy.controlMode !== 'geo'}
            />
          </div>
          <label className="flex items-center gap-2 text-[11px] text-secondary">
            <FieldLabel>Quality</FieldLabel>
            <select
              value={sunStudy.shadowQuality}
              disabled={disabled || !sunStudy.shadowsEnabled}
              onChange={(event) => patchSunStudy({ shadowQuality: event.target.value })}
              className="h-7 min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1 text-[11px] text-secondary outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {BIM_SUN_STUDY_SHADOW_QUALITIES.map((quality) => (
                <option key={quality} value={quality}>{quality}</option>
              ))}
            </select>
          </label>
          {sunStudy.controlMode === 'geo' && (
            <NumericField
              label="Radius"
              value={sunStudy.sunPathRadius}
              min={0.25}
              max={5}
              step={0.25}
              onChange={(sunPathRadius) => patchSunStudy({ sunPathRadius })}
              disabled={disabled || !sunStudy.showSunPath}
              suffix="x"
            />
          )}
          <NumericField
            label="Speed"
            value={sunStudy.animation.playbackSpeedHoursPerSecond}
            min={0.1}
            max={24}
            step={0.1}
            onChange={(playbackSpeedHoursPerSecond) => patchAnimation({ playbackSpeedHoursPerSecond })}
            disabled={disabled || sunStudy.controlMode !== 'geo' || !sunStudy.animation.enabled}
            suffix="h/s"
          />
        </section>

        <section className="grid grid-cols-3 gap-2 border-t border-border pt-2 text-[10px]">
          <div>
            <FieldLabel>Az</FieldLabel>
            <div className="font-mono text-secondary">{readout.azimuthDeg.toFixed(1)}</div>
          </div>
          <div>
            <FieldLabel>Elev</FieldLabel>
            <div className={readout.belowHorizon ? 'font-mono text-warning' : 'font-mono text-secondary'}>
              {readout.elevationDeg.toFixed(1)}
            </div>
          </div>
          <div>
            <FieldLabel>Sun</FieldLabel>
            <div className={readout.belowHorizon ? 'text-warning' : 'text-secondary'}>
              {readout.belowHorizon ? 'Below' : 'Up'}
            </div>
          </div>
          <div className="col-span-3">
            <FieldLabel>Calc</FieldLabel>
            <div className="truncate font-mono text-[9px] text-muted" title={readout.algorithm}>
              {readout.algorithm}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
