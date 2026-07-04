import React, { useRef, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { VintageSlider } from '../../../components/VintageSlider.jsx';
import { PitchSliderControl } from '../../../components/PitchSliderControl.jsx';
import {
  getVoiceParamPath,
  patchVoiceFromPath,
  PITCH_CONTROL_KEY,
  SONIC_VOICE_PARAM_CONTROLS,
} from '../domain/sonicVoiceParams.js';
import {
  playSonicVoicePreview,
  stopSonicPreviewSource,
} from '../domain/sonicVoicePreview.js';

export function SonicVoiceControls({
  voice,
  onChange,
  engineState = {},
  disabled = false,
  compact = false,
  showPreview = true,
  onPointerGuard,
}) {
  const audioContextRef = useRef(null);
  const activeSourceRef = useRef(null);
  const [previewStatus, setPreviewStatus] = useState('idle');
  const [previewError, setPreviewError] = useState('');
  const [pitchSemitoneMode, setPitchSemitoneMode] = useState(false);

  if (!voice) return null;

  const updateParam = (path, value) => {
    onChange?.(patchVoiceFromPath(path, value));
  };

  const previewVoice = async () => {
    setPreviewError('');
    setPreviewStatus('rendering');
    try {
      stopSonicPreviewSource(activeSourceRef);
      setPreviewStatus('playing');
      await playSonicVoicePreview({
        voice,
        engineState,
        audioContextRef,
        activeSourceRef,
      });
      setPreviewStatus('idle');
    } catch (error) {
      setPreviewStatus('idle');
      setPreviewError(error?.message || 'Could not play Sonic preview.');
    }
  };

  const stopPreview = () => {
    stopSonicPreviewSource(activeSourceRef);
    setPreviewStatus('idle');
  };

  const labelColClass = compact ? 'grid-cols-[3.75rem_1fr]' : 'grid-cols-[5rem_1fr]';
  const rowGapClass = compact ? 'gap-1' : 'gap-2';
  const guard = onPointerGuard ?? {};

  return (
    <div className={`grid ${compact ? 'gap-1' : 'gap-2'}`}>
      {SONIC_VOICE_PARAM_CONTROLS.map((control) => {
        if (control.key === PITCH_CONTROL_KEY) {
          return (
            <PitchSliderControl
              key={control.key}
              variant={compact ? 'card' : 'compact'}
              label={control.label}
              value={getVoiceParamPath(voice, control.key) ?? 0}
              semitoneMode={pitchSemitoneMode}
              onSemitoneModeChange={setPitchSemitoneMode}
              disabled={disabled}
              onPointerGuard={guard}
              onChange={(nextValue) => updateParam(control.key, nextValue)}
            />
          );
        }
        const value = getVoiceParamPath(voice, control.key) ?? 0;
        return (
          <label key={control.key} className={`sans text-[10px] text-muted grid ${labelColClass} ${rowGapClass} items-center`}>
            <span className="truncate">{control.label}</span>
            <VintageSlider
              min={control.min}
              max={control.max}
              step={control.step}
              value={value}
              disabled={disabled}
              onPointerDown={guard.onPointerDown}
              onMouseDown={guard.onMouseDown}
              onDoubleClick={guard.onDoubleClick}
              onChange={(event) => updateParam(control.key, event.target.value)}
            />
          </label>
        );
      })}
      {showPreview && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={disabled || previewStatus === 'rendering'}
            onClick={() => void previewVoice()}
            className="sans text-xs border border-border rounded px-2 py-1 flex items-center gap-1 disabled:opacity-40"
          >
            <Play size={12} />
            {previewStatus === 'rendering' ? 'Rendering…' : 'Preview'}
          </button>
          {previewStatus === 'playing' && (
            <button
              type="button"
              onClick={stopPreview}
              className="sans text-xs border border-border rounded px-2 py-1"
              title="Stop preview"
            >
              <Square size={12} />
            </button>
          )}
        </div>
      )}
      {showPreview && previewError && (
        <div className="sans text-[10px] text-danger">{previewError}</div>
      )}
    </div>
  );
}
