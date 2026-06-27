import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Blend, BookmarkPlus, Play, RotateCcw, Save, Square } from 'lucide-react';
import {
  addSonicSavePoint,
  buildSonicStudioCardPatch,
  loadSonicSavePoint,
  morphBetweenSonicSavePoints,
  normalizeSonicStudioCardState,
  summarizeSonicVoice,
  updateSonicVoiceFromSpace,
  updateSonicVoice,
} from '../domain/sonicStudioCard.js';
import { renderSonicStudioVoicePreview } from '../domain/sonicStudioAudition.js';

const PARAM_CONTROLS = [
  { key: 'material.brightness', label: 'Brightness', min: 0, max: 1, step: 0.01 },
  { key: 'material.hardness', label: 'Hardness', min: 0, max: 1, step: 0.01 },
  { key: 'body.resonance', label: 'Resonance', min: 0, max: 1, step: 0.01 },
  { key: 'body.damping', label: 'Damping', min: 0, max: 1, step: 0.01 },
  { key: 'contact.friction', label: 'Friction', min: 0, max: 1, step: 0.01 },
  { key: 'output.gain', label: 'Gain', min: 0, max: 1.5, step: 0.01 },
];

export function SonicStudioEditor({ card, onUpdateCard }) {
  const cardState = useMemo(() => normalizeSonicStudioCardState(card), [card]);
  const [draftState, setDraftState] = useState(cardState);
  const [selectedVoiceId, setSelectedVoiceId] = useState(cardState.voices[0]?.id ?? null);
  const [saveName, setSaveName] = useState('');
  const [fromSaveId, setFromSaveId] = useState('');
  const [toSaveId, setToSaveId] = useState('');
  const [morphAmount, setMorphAmount] = useState(0.5);
  const [previewStatus, setPreviewStatus] = useState('idle');
  const [previewError, setPreviewError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const audioContextRef = useRef(null);
  const activeSourceRef = useRef(null);
  const persistTimerRef = useRef(null);
  const latestDraftRef = useRef(cardState);
  const state = draftState;
  const selectedVoice = state.voices.find((voice) => voice.id === selectedVoiceId) ?? state.voices[0];
  const voiceSummary = selectedVoice ? summarizeSonicVoice(selectedVoice) : null;

  useEffect(() => {
    setDraftState(cardState);
    latestDraftRef.current = cardState;
    setSaveStatus('');
    setSelectedVoiceId((current) => (
      cardState.voices.some((voice) => voice.id === current)
        ? current
        : cardState.voices[0]?.id ?? null
    ));
  }, [card.id]);

  useEffect(() => () => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
  }, []);

  const persistDraft = (nextState = latestDraftRef.current) => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    latestDraftRef.current = nextState;
    onUpdateCard?.(buildSonicStudioCardPatch(nextState, card.sonicRenderedAssets ?? []));
    setSaveStatus('Saved');
  };

  const applyDraft = (nextState, { immediate = false, status = 'Unsaved changes' } = {}) => {
    setDraftState(nextState);
    latestDraftRef.current = nextState;
    setSaveStatus(status);
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    if (immediate) {
      persistDraft(nextState);
      return;
    }
    persistTimerRef.current = setTimeout(() => {
      persistDraft(latestDraftRef.current);
    }, 350);
  };

  const updateSelectedVoice = (path, value) => {
    if (!selectedVoice) return;
    applyDraft(updateSonicVoice(state, selectedVoice.id, patchFromPath(path, Number(value))));
  };

  const addSavePoint = () => {
    if (!selectedVoice) return;
    const next = addSonicSavePoint(state, selectedVoice.id, {
      name: saveName.trim() || selectedVoice.name,
    });
    const newPoint = next.savePoints.at(-1);
    setSaveName('');
    if (newPoint) {
      if (!fromSaveId) setFromSaveId(newPoint.id);
      else if (!toSaveId && fromSaveId !== newPoint.id) setToSaveId(newPoint.id);
    }
    applyDraft(next, { immediate: true, status: 'Preset saved' });
  };

  const loadSavePoint = (savePoint) => {
    if (!selectedVoice || !savePoint) return;
    const next = loadSonicSavePoint(state, savePoint.id, selectedVoice.id);
    applyDraft(next, { immediate: true, status: 'Preset loaded' });
  };

  const applyMorph = () => {
    if (!fromSaveId || !toSaveId || fromSaveId === toSaveId) return;
    const next = morphBetweenSonicSavePoints(state, fromSaveId, toSaveId, morphAmount, {
      targetVoiceId: selectedVoice?.id,
    });
    if (selectedVoice?.id) setSelectedVoiceId(selectedVoice.id);
    applyDraft(next, { immediate: true, status: 'Morph applied' });
  };

  const moveSelectedVoiceInSpace = (event) => {
    if (!selectedVoice) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = (1 - ((event.clientY - rect.top) / rect.height)) * 2 - 1;
    applyDraft(updateSonicVoiceFromSpace(state, selectedVoice.id, { x, y }));
  };

  const previewVoice = async (voice = selectedVoice) => {
    if (!voice) return;
    setPreviewError('');
    setPreviewStatus('rendering');
    try {
      const context = await getAudioContext(audioContextRef);
      stopPreview(activeSourceRef);
      if (context.state === 'suspended') await context.resume();
      const render = renderSonicStudioVoicePreview({
        voice,
        engineState: state,
        sampleRate: context.sampleRate,
        seed: Date.now() % 100000,
      });
      const source = createBufferSource(context, render.buffer);
      const gain = context.createGain();
      gain.gain.value = 0.9;
      source.connect(gain);
      gain.connect(context.destination);
      source.onended = () => {
        if (activeSourceRef.current === source) {
          activeSourceRef.current = null;
          setPreviewStatus('idle');
        }
      };
      activeSourceRef.current = source;
      source.start();
      setPreviewStatus('playing');
    } catch (error) {
      setPreviewStatus('idle');
      setPreviewError(error?.message || 'Could not play Sonic preview.');
    }
  };

  const previewSavePoint = async (savePoint) => {
    await previewVoice(savePoint?.fullState);
  };

  const previewMorph = async () => {
    if (!fromSaveId || !toSaveId || fromSaveId === toSaveId) return;
    const next = morphBetweenSonicSavePoints(state, fromSaveId, toSaveId, morphAmount, {
      targetVoiceId: selectedVoice?.id,
    });
    await previewVoice(next.voices.find((voice) => voice.id === selectedVoice?.id) ?? next.voices[0]);
  };

  const stopCurrentPreview = () => {
    stopPreview(activeSourceRef);
    setPreviewStatus('idle');
  };

  if (!selectedVoice) {
    return (
      <div className="h-full flex items-center justify-center bg-canvas text-secondary">
        No Sonic voices available.
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 bg-canvas text-primary flex flex-col">
      <div className="shrink-0 border-b border-border px-5 py-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="sans text-[10px] uppercase tracking-wider text-muted">Sonic Studio</div>
          <h2 className="serif text-xl truncate">{card.name}</h2>
        </div>
        <div className="sans text-[10px] text-muted shrink-0">
          {state.voices.length} voices · {state.savePoints.length} save points
        </div>
      </div>
      <div className="flex-1 min-h-0 grid md:grid-cols-[16rem_minmax(0,1fr)_18rem]">
        <aside className="border-r border-border bg-surface min-h-0 overflow-y-auto p-3">
          <div className="sans text-[10px] uppercase tracking-wider text-muted mb-2">Voices</div>
          <div className="space-y-1">
            {state.voices.map((voice) => (
              <div
                key={voice.id}
                className={`flex items-center gap-1 rounded border ${
                  voice.id === selectedVoice.id
                    ? 'border-accent bg-accent/10 text-primary'
                    : 'border-border bg-canvas text-secondary hover:text-primary'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedVoiceId(voice.id)}
                  className="min-w-0 flex-1 text-left px-3 py-2 text-sm"
                >
                  <span className="block sans truncate">{voice.name}</span>
                  <span className="block sans text-[10px] text-muted uppercase tracking-wider">{voice.archetype}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void previewVoice(voice)}
                  title={`Preview ${voice.name}`}
                  className="shrink-0 mr-2 rounded p-1.5 text-muted hover:text-primary hover:bg-surface-muted"
                >
                  <Play size={13} />
                </button>
              </div>
            ))}
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <section className="min-w-0">
              <div className="mb-5">
                <div className="sans text-[10px] uppercase tracking-wider text-muted">Selected Voice</div>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="serif text-2xl text-primary">{selectedVoice.name}</h3>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => void previewVoice(selectedVoice)}
                      className="sans text-xs bg-accent text-on-accent px-3 py-2 rounded flex items-center gap-2"
                    >
                      <Play size={14} />
                      Preview
                    </button>
                    {previewStatus === 'playing' && (
                      <button
                        type="button"
                        onClick={stopCurrentPreview}
                        title="Stop preview"
                        className="text-secondary border border-border px-2 py-2 rounded hover:text-primary"
                      >
                        <Square size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="sans text-[10px] text-muted mt-1">
                  {previewStatus === 'rendering' ? 'Rendering preview...' : previewStatus === 'playing' ? 'Playing preview' : 'Adjust a parameter and preview the voice'}
                </div>
                {saveStatus && (
                  <div className="sans text-[10px] text-muted mt-1">{saveStatus}</div>
                )}
                {previewError && (
                  <div className="sans text-xs text-danger bg-danger-muted border border-danger-border rounded px-3 py-2 mt-2">
                    {previewError}
                  </div>
                )}
              </div>
              <div className="space-y-4">
                {PARAM_CONTROLS.map((control) => {
                  const value = getPath(selectedVoice, control.key) ?? 0;
                  return (
                    <label key={control.key} className="block">
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <span className="sans text-xs text-secondary">{control.label}</span>
                        <span className="sans text-[10px] text-muted tabular-nums">{Number(value).toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={control.min}
                        max={control.max}
                        step={control.step}
                        value={value}
                        onChange={(event) => updateSelectedVoice(control.key, event.target.value)}
                        className="w-full accent-[var(--color-accent)]"
                      />
                    </label>
                  );
                })}
              </div>
            </section>

            <section className="min-w-0">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="sans text-[10px] uppercase tracking-wider text-muted">Sonic Space</div>
                {voiceSummary && (
                  <div className="sans text-[10px] text-muted tabular-nums">
                    X {((voiceSummary.x + 1) / 2).toFixed(2)} · Y {((voiceSummary.y + 1) / 2).toFixed(2)}
                  </div>
                )}
              </div>
              <div
                role="button"
                tabIndex={0}
                onClick={moveSelectedVoiceInSpace}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    moveSelectedVoiceInSpace(event);
                  }
                }}
                className="relative block w-full aspect-square rounded-md border border-border bg-surface overflow-hidden text-left"
                title="Click to move the selected voice in Sonic Space"
              >
                <div className="absolute inset-x-0 top-1/2 border-t border-border" />
                <div className="absolute inset-y-0 left-1/2 border-l border-border" />
                <div className="absolute left-2 bottom-2 sans text-[9px] text-muted">low</div>
                <div className="absolute right-2 top-2 sans text-[9px] text-muted">high</div>
                {state.savePoints.map((point) => (
                  <button
                    key={point.id}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedVoiceId(point.fullState.id);
                      void previewSavePoint(point);
                    }}
                    className="absolute h-4 w-4 -ml-2 -mt-2 rounded-full border border-accent bg-canvas"
                    style={{
                      left: `${((point.x + 1) / 2) * 100}%`,
                      top: `${(1 - ((point.y + 1) / 2)) * 100}%`,
                    }}
                    title={point.name}
                  />
                ))}
                {voiceSummary && (
                  <div
                    className="absolute h-5 w-5 -ml-2.5 -mt-2.5 rounded-full bg-accent shadow"
                    style={{
                      left: `${((voiceSummary.x + 1) / 2) * 100}%`,
                      top: `${(1 - ((voiceSummary.y + 1) / 2)) * 100}%`,
                    }}
                    title={selectedVoice.name}
                  />
                )}
              </div>
            </section>
          </div>
        </main>

        <aside className="border-l border-border bg-surface min-h-0 overflow-y-auto p-4">
          <div className="sans text-[10px] uppercase tracking-wider text-muted mb-2">Save Point</div>
          <div className="flex gap-2">
            <input
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              placeholder={selectedVoice.name}
              className="min-w-0 flex-1 rounded border border-border bg-canvas px-2 py-1.5 text-xs text-primary"
            />
            <button
              type="button"
              onClick={addSavePoint}
              title="Save point"
              className="shrink-0 rounded bg-accent text-on-accent p-2"
            >
              <BookmarkPlus size={14} />
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {state.savePoints.length === 0 ? (
              <div className="sans text-xs text-muted rounded border border-border bg-canvas px-3 py-2">
                No saved presets yet.
              </div>
            ) : state.savePoints.map((point) => (
              <div key={point.id} className="rounded border border-border bg-canvas px-3 py-2">
                <div className="sans text-xs text-primary truncate">{point.name}</div>
                <div className="sans text-[10px] text-muted uppercase tracking-wider">{point.fullState.archetype}</div>
                <div className="mt-2 flex gap-1">
                  <button
                    type="button"
                    onClick={() => void previewSavePoint(point)}
                    title="Preview preset"
                    className="rounded border border-border px-2 py-1 text-secondary hover:text-primary"
                  >
                    <Play size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => loadSavePoint(point)}
                    title="Load preset into selected voice"
                    className="rounded border border-border px-2 py-1 text-secondary hover:text-primary"
                  >
                    <RotateCcw size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setFromSaveId(point.id)}
                    className="sans text-[10px] rounded border border-border px-2 py-1 text-secondary hover:text-primary"
                  >
                    From
                  </button>
                  <button
                    type="button"
                    onClick={() => setToSaveId(point.id)}
                    className="sans text-[10px] rounded border border-border px-2 py-1 text-secondary hover:text-primary"
                  >
                    To
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="sans text-[10px] uppercase tracking-wider text-muted mt-6 mb-2">Morph</div>
          <SavePointSelect value={fromSaveId} onChange={setFromSaveId} savePoints={state.savePoints} label="From" />
          <SavePointSelect value={toSaveId} onChange={setToSaveId} savePoints={state.savePoints} label="To" />
          <label className="block mt-3">
            <div className="flex items-center justify-between gap-3 mb-1">
              <span className="sans text-xs text-secondary">Amount</span>
              <span className="sans text-[10px] text-muted tabular-nums">{morphAmount.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={morphAmount}
              onChange={(event) => setMorphAmount(Number(event.target.value))}
              className="w-full accent-[var(--color-accent)]"
            />
          </label>
          <button
            type="button"
            onClick={() => void previewMorph()}
            disabled={!fromSaveId || !toSaveId || fromSaveId === toSaveId}
            className="mt-3 w-full sans text-xs border border-border text-secondary hover:text-primary px-3 py-2 rounded disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <Play size={14} />
            Preview morph
          </button>
          <button
            type="button"
            onClick={applyMorph}
            disabled={!fromSaveId || !toSaveId || fromSaveId === toSaveId}
            className="mt-2 w-full sans text-xs bg-primary text-on-primary px-3 py-2 rounded disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <Blend size={14} />
            Apply morph
          </button>

          <div className="sans text-[10px] uppercase tracking-wider text-muted mt-6 mb-2">State</div>
          <div className="rounded border border-border bg-canvas p-3">
            <div className="sans text-[10px] text-muted">Source hash</div>
            <div className="sans text-xs text-secondary break-all">{card.sonicSourceStateHash ?? 'unsaved'}</div>
          </div>
          <button
            type="button"
            onClick={() => persistDraft(state)}
            className="mt-3 w-full sans text-xs border border-border text-secondary hover:text-primary px-3 py-2 rounded flex items-center justify-center gap-2"
          >
            <Save size={14} />
            Save state
          </button>
        </aside>
      </div>
    </div>
  );
}

async function getAudioContext(audioContextRef) {
  const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextCtor) throw new Error('WebAudio is not available in this browser.');
  if (!audioContextRef.current) audioContextRef.current = new AudioContextCtor();
  return audioContextRef.current;
}

function createBufferSource(context, renderedBuffer) {
  const left = renderedBuffer?.[0] ?? new Float32Array(0);
  const right = renderedBuffer?.[1] ?? left;
  const frames = Math.max(left.length, right.length);
  const buffer = context.createBuffer(2, frames, context.sampleRate);
  buffer.copyToChannel(left, 0, 0);
  buffer.copyToChannel(right, 1, 0);
  const source = context.createBufferSource();
  source.buffer = buffer;
  return source;
}

function stopPreview(activeSourceRef) {
  if (!activeSourceRef.current) return;
  try {
    activeSourceRef.current.stop();
  } catch {
    /* already stopped */
  }
  activeSourceRef.current = null;
}

function SavePointSelect({ value, onChange, savePoints, label }) {
  return (
    <label className="block mb-2">
      <span className="sans text-[10px] text-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded border border-border bg-canvas px-2 py-1.5 text-xs text-primary"
      >
        <option value="">Select point</option>
        {savePoints.map((point) => (
          <option key={point.id} value={point.id}>{point.name}</option>
        ))}
      </select>
    </label>
  );
}

function getPath(object, path) {
  return path.split('.').reduce((value, part) => value?.[part], object);
}

function patchFromPath(path, value) {
  const parts = path.split('.');
  const output = {};
  let target = output;
  for (let index = 0; index < parts.length - 1; index += 1) {
    target[parts[index]] = {};
    target = target[parts[index]];
  }
  target[parts.at(-1)] = value;
  return output;
}
