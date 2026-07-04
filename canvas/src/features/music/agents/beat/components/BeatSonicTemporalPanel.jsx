import React from 'react';
import { VintageSlider } from '../../../../../components/VintageSlider.jsx';
import {
  createDefaultBeatAudioRouting,
  createDefaultBeatMixSettings,
  createDefaultBeatSonicTemporalState,
  normalizeSonicTemporal,
} from '../../../../../../packages/music-core/src/index.js';
import { findSonicStudioCards } from '../domain/beatTrackSoundSource.js';

export function BeatSonicTemporalPanel({
  sonicTemporal,
  audioRouting,
  mixSettings,
  cards = [],
  onChangeSonicTemporal,
  onChangeAudioRouting,
  onChangeMixSettings,
  onChangeTemporalActive,
  onImportFromCard,
}) {
  const temporal = normalizeSonicTemporal(sonicTemporal ?? createDefaultBeatSonicTemporalState());
  const routing = createDefaultBeatAudioRouting(audioRouting);
  const mix = createDefaultBeatMixSettings(mixSettings);
  const sonicCards = findSonicStudioCards(cards);
  const temporalActive = !routing.sonicTemporalBypass && temporal.enabled;

  const updateTemporal = (patch) => onChangeSonicTemporal?.(
    normalizeSonicTemporal({ ...temporal, ...patch }),
  );
  const updateDelay = (patch) => updateTemporal({ delay: { ...temporal.delay, ...patch } });
  const updateShimmer = (patch) => updateTemporal({ shimmer: { ...temporal.shimmer, ...patch } });
  const updateFreeze = (patch) => updateTemporal({ freeze: { ...temporal.freeze, ...patch } });
  const updateRouting = (patch) => onChangeAudioRouting?.(
    createDefaultBeatAudioRouting({ ...routing, ...patch }),
  );
  const updateMix = (patch) => onChangeMixSettings?.(
    createDefaultBeatMixSettings({ ...mix, ...patch }),
  );
  const setTemporalActive = (active) => {
    if (onChangeTemporalActive) {
      onChangeTemporalActive(active);
      return;
    }
    updateRouting({ sonicTemporalBypass: !active });
    updateTemporal({ enabled: active });
  };

  return (
    <section className="border border-border bg-surface rounded p-3">
      <div className="sans text-[10px] uppercase tracking-wider text-muted mb-3">Sonic Temporal FX</div>
      <div className="grid gap-2 mb-3">
        <label className="sans text-xs text-secondary flex items-center gap-2">
          <input
            type="checkbox"
            checked={temporalActive}
            onChange={(event) => setTemporalActive(event.target.checked)}
          />
          Sonic temporal FX active
        </label>
      </div>
      <div className="grid gap-2 border-t border-border pt-3">
        {[
          ['delayMs', temporal.delay.delayMs, 20, 1200, 1, 'delayMs', updateDelay],
          ['delay wet', temporal.delay.wet, 0, 1, 0.01, 'wet', updateDelay],
          ['delay fb', temporal.delay.feedback, 0, 0.92, 0.01, 'feedback', updateDelay],
        ].map(([label, value, min, max, step, key, handler]) => (
          <label key={label} className="sans text-[10px] text-muted grid grid-cols-[5rem_1fr] gap-2 items-center">
            {label}
            <VintageSlider
              min={min}
              max={max}
              step={step}
              value={value}
              onChange={(event) => handler({ [key]: Number(event.target.value) })}
            />
          </label>
        ))}
        <label className="sans text-xs text-secondary flex items-center gap-2">
          <input
            type="checkbox"
            checked={temporal.shimmer.enabled}
            onChange={(event) => updateShimmer({ enabled: event.target.checked })}
          />
          Shimmer
        </label>
        <label className="sans text-[10px] text-muted grid grid-cols-[5rem_1fr] gap-2 items-center">
          shimmer wet
          <VintageSlider
            min="0"
            max="1"
            step="0.01"
            value={temporal.shimmer.wet}
            onChange={(event) => updateShimmer({ wet: Number(event.target.value) })}
          />
        </label>
        <label className="sans text-xs text-secondary flex items-center gap-2">
          <input
            type="checkbox"
            checked={temporal.freeze.enabled}
            onChange={(event) => updateFreeze({ enabled: event.target.checked })}
          />
          Freeze
        </label>
        <label className="sans text-xs text-secondary flex items-center gap-2">
          <input
            type="checkbox"
            checked={routing.freezeHold}
            onChange={(event) => updateRouting({ freezeHold: event.target.checked })}
          />
          Freeze hold
        </label>
      </div>
      <div className="grid gap-2 border-t border-border pt-3 mt-3">
        <div className="sans text-[10px] uppercase tracking-wider text-muted">Mix (3E)</div>
        <label className="sans text-[10px] text-muted grid grid-cols-[5rem_1fr] gap-2 items-center">
          kick send
          <VintageSlider
            min="0"
            max="0.5"
            step="0.01"
            value={mix.roleSendLevels.kick}
            onChange={(event) => updateMix({
              roleSendLevels: { ...mix.roleSendLevels, kick: Number(event.target.value) },
            })}
          />
        </label>
        <label className="sans text-[10px] text-muted grid grid-cols-[5rem_1fr] gap-2 items-center">
          snare send
          <VintageSlider
            min="0"
            max="0.5"
            step="0.01"
            value={mix.roleSendLevels.snare}
            onChange={(event) => updateMix({
              roleSendLevels: { ...mix.roleSendLevels, snare: Number(event.target.value) },
            })}
          />
        </label>
        <label className="sans text-[10px] text-muted grid grid-cols-[5rem_1fr] gap-2 items-center">
          return HP
          <VintageSlider
            min="20"
            max="400"
            step="1"
            value={mix.returnLowCutHz}
            onChange={(event) => updateMix({ returnLowCutHz: Number(event.target.value) })}
          />
        </label>
        <label className="sans text-[10px] text-muted grid grid-cols-[5rem_1fr] gap-2 items-center">
          max wet
          <VintageSlider
            min="0"
            max="1"
            step="0.01"
            value={mix.maxWet}
            onChange={(event) => updateMix({ maxWet: Number(event.target.value) })}
          />
        </label>
      </div>
      {sonicCards.length > 0 && (
        <div className="border-t border-border pt-3 mt-3">
          <label className="sans text-[10px] text-muted grid gap-1">
            Import temporal from Sonic card
            <select
              className="bg-surface-muted border border-border rounded-sm px-2 py-1 text-xs text-primary"
              defaultValue=""
              onChange={(event) => {
                const card = sonicCards.find((item) => item.id === event.target.value);
                if (card) onImportFromCard?.(card);
                event.target.value = '';
              }}
            >
              <option value="">Select card…</option>
              {sonicCards.map((card) => (
                <option key={card.id} value={card.id}>{card.name ?? card.id}</option>
              ))}
            </select>
          </label>
        </div>
      )}
    </section>
  );
}
