import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createDefaultBeatAgentState } from '../domain/beatAgentState.js';
import { buildDeterministicBeatMutation } from '../domain/beatAi.js';
import { BeatTransportStrip } from '../../../transport/BeatTransportStrip.jsx';
import {
  fetchChronicleEvents,
  fetchMusicPresets,
  fetchMusicVersions,
  fetchProjectDescriptorGraph,
  fetchProjectSpaceState,
  fetchSketchClusters,
  fetchSketchForAgent,
  fetchSonicSketches,
  fetchTemporalSketches,
  exportMusicAgent,
  importMusicAgentPackage,
  recordChronicleEvent,
  restoreMusicVersion,
  saveMusicPreset,
  saveMusicVersion,
  saveProjectDescriptorGraph,
  saveProjectSpaceState,
  saveSketchDescriptorGraph,
  saveSonicSketch,
} from '../../../api/musicApi.js';
import {
  createDefaultDescriptorGraph,
  createDefaultSpaceState,
  createDefaultBeatAudioRouting,
  analyzeMusicClutter,
  deriveSpaceFromDescriptors,
  normalizeSonicTemporal,
} from '../../../../../../packages/music-core/src/index.js';
import { downloadMusicArtifactPackage } from '../../../serialization/musicArtifactPackage.js';
import { useBeatAgentRuntime } from '../hooks/useBeatAgentRuntime.js';
import { BeatTrackSoundControls } from './BeatTrackSoundControls.jsx';
import { BeatSonicTemporalPanel } from './BeatSonicTemporalPanel.jsx';
import { summarizeBeatSonicLinks } from '../domain/beatSonicCanvasLinks.js';
import { refreshTrackFromSonicCard, buildLinkedSonicCardSyncPatch } from '../domain/beatTrackSoundSource.js';
import { wireSonicVoiceToBeatAgent } from '../domain/wireSonicVoiceToBeatAgent.js';
import { DescriptorGraphPanel } from '../../../descriptors/DescriptorGraphPanel.jsx';
import { pickNewestDescriptorGraph, pickNewestSpaceState } from '../../../descriptors/descriptorGraphPersistence.js';
import { ChronicleTimeline } from '../../../chronicle/ChronicleTimeline.jsx';
import { SpacePanel } from '../../../space/SpacePanel.jsx';
import { ReflectionPanel } from '../../../reflection/ReflectionPanel.jsx';
import { ExplorationWorkspace } from '../../../workspace/ExplorationWorkspace.jsx';

function StepCell({ active, velocity, isPlayhead, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 rounded-sm border transition ${
        active
          ? 'bg-accent border-accent text-on-accent'
          : 'bg-surface-muted border-border hover:border-accent/50'
      } ${isPlayhead ? 'ring-2 ring-warning' : ''}`}
      title={`Velocity ${Math.round((velocity ?? 0) * 100)}%`}
    />
  );
}

function updateCardFromFullscreen(onUpdateCard, cardId, updates) {
  if (!onUpdateCard || !cardId) return;
  if (onUpdateCard.length >= 2) {
    onUpdateCard(cardId, updates);
  } else {
    onUpdateCard(updates);
  }
}

export function BeatAgentFullscreen({
  card,
  cards = [],
  clusterId = null,
  canvasEdges = [],
  projectId,
  folderHandle = null,
  onUpdateCard,
  onGraphRefresh = null,
}) {
  const [copyTemporalOnAssign, setCopyTemporalOnAssign] = useState(false);
  const [presets, setPresets] = useState([]);
  const [versions, setVersions] = useState([]);
  const [sketch, setSketch] = useState(null);
  const [sketches, setSketches] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [chronicleEvents, setChronicleEvents] = useState([]);
  const [descriptorGraph, setDescriptorGraph] = useState(() => pickNewestDescriptorGraph(
    card.musicState?.descriptorGraph,
    card.descriptorGraph,
  ));
  const [spaceState, setSpaceState] = useState(() => createDefaultSpaceState(
    card.musicState?.spaceState ?? card.spaceState,
  ));
  const [temporalSketches, setTemporalSketches] = useState([]);
  const pendingDescriptorPersistRef = useRef(null);
  const persistDescriptorGraphDrivenStateRef = useRef(null);
  const descriptorPersistSeqRef = useRef(0);
  const descriptorDirtyRef = useRef(false);
  const {
    agent,
    setAgent,
    state,
    setState,
    status,
    setStatus,
    error,
    transport,
    playhead,
    prepareBeatAudio,
    enableBeatAudio,
    audioContextState,
    toggleStep,
    updateTrackSynth,
    updateTrackSound,
    updateAgentAudio,
    setTemporalActive,
    updateTransportSettings,
    clockSync,
    toggleClockSync,
    persist,
    isolatedTrackId,
    toggleTrackIsolate,
  } = useBeatAgentRuntime({
    card,
    cards,
    projectId,
    folderHandle,
    onUpdateCard,
    descriptorGraph,
    spaceState,
  });

  const sonicLinkSummary = useMemo(() => summarizeBeatSonicLinks({
    beatCardId: card?.id,
    pattern: state.pattern,
    canvasEdges,
    cards,
  }), [card?.id, state.pattern, canvasEdges, cards]);

  const wireSonicLink = useCallback(({ sonicCard, track, voiceId }) => {
    if (!clusterId) return;
    void wireSonicVoiceToBeatAgent({
      clusterId,
      sonicCard,
      beatCard: card,
      trackId: track?.id,
      voiceId,
    }).then(() => onGraphRefresh?.()).catch(() => {});
  }, [card, clusterId, onGraphRefresh]);

  const syncTrackVoiceToSonicCard = useCallback((nextTrack) => {
    const cardId = nextTrack?.sonicProvenance?.cardId;
    if (!cardId || !nextTrack?.sonicProvenance?.syncToCard) return;
    const sonicCard = cards.find((candidate) => candidate.id === cardId);
    const sync = buildLinkedSonicCardSyncPatch(nextTrack, sonicCard);
    if (!sync) return;
    updateCardFromFullscreen(onUpdateCard, sync.cardId, sync.patch);
  }, [cards, onUpdateCard]);

  const refreshStaleSonicTracks = useCallback(() => {
    for (const track of sonicLinkSummary.staleTracks) {
      const sonicCard = cards.find((candidate) => candidate.id === track.sonicProvenance?.cardId);
      if (!sonicCard) continue;
      updateTrackSound(track.id, refreshTrackFromSonicCard(track, sonicCard), { debounce: false });
    }
  }, [cards, sonicLinkSummary.staleTracks, updateTrackSound]);

  useEffect(() => {
    if (!projectId) return;
    fetchMusicPresets(projectId).then(setPresets).catch(() => {});
    fetchSketchClusters(projectId).then(setClusters).catch(() => {});
    fetchSonicSketches(projectId).then(setSketches).catch(() => {});
    fetchProjectSpaceState(projectId)
      .then((loadedSpace) => {
        if (!loadedSpace) return;
        setSpaceState((current) => pickNewestSpaceState(current, loadedSpace));
      })
      .catch(() => {});
    fetchProjectDescriptorGraph(projectId)
      .then((loadedGraph) => {
        if (!loadedGraph || descriptorDirtyRef.current) return;
        setDescriptorGraph((current) => pickNewestDescriptorGraph(current, loadedGraph));
      })
      .catch(() => {});
    fetchChronicleEvents(projectId).then(setChronicleEvents).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    if (!state.descriptorGraph || descriptorDirtyRef.current) return;
    setDescriptorGraph((current) => pickNewestDescriptorGraph(
      current,
      state.descriptorGraph,
    ));
  }, [state.descriptorGraph]);

  useEffect(() => {
    const agentId = agent?.id || card.musicAgentId || card.versions?.[0]?.musicAgentId;
    if (!agentId) return;
    fetchMusicVersions(agentId).then(setVersions).catch(() => {});
    fetchSketchForAgent(agentId)
      .then((loadedSketch) => {
        if (!loadedSketch) {
          setSketch(null);
          return;
        }
        setSketch(loadedSketch);
        if (!descriptorDirtyRef.current) {
          setDescriptorGraph((current) => pickNewestDescriptorGraph(
            current,
            card.musicState?.descriptorGraph,
            card.descriptorGraph,
            loadedSketch.descriptorGraph,
          ));
          if (loadedSketch.spaceState) {
            setSpaceState((current) => pickNewestSpaceState(
              current,
              card.musicState?.spaceState,
              card.spaceState,
              loadedSketch.spaceState,
            ));
          }
        }
        if (projectId) {
          fetchChronicleEvents(projectId, { sketchId: loadedSketch.id }).then(setChronicleEvents).catch(() => {});
          fetchTemporalSketches(projectId, loadedSketch.id).then(setTemporalSketches).catch(() => {});
        }
      })
      .catch(() => {});
  }, [agent?.id, card.musicAgentId, card.versions, projectId]);

  useEffect(() => () => {
    const pending = pendingDescriptorPersistRef.current;
    pendingDescriptorPersistRef.current = null;
    if (pending) {
      void persistDescriptorGraphDrivenStateRef.current?.(pending);
    }
  }, []);

  async function refreshChronicle(nextSketchId = sketch?.id) {
    if (!projectId) return;
    setChronicleEvents(await fetchChronicleEvents(projectId, { sketchId: nextSketchId }));
  }

  async function savePreset() {
    if (!projectId) return;
    await saveMusicPreset(projectId, {
      agentId: agent?.id ?? card.musicAgentId,
      agentType: 'beat',
      name: state.pattern.name,
      preset: state,
      tags: ['beat'],
    });
    setPresets(await fetchMusicPresets(projectId));
    setStatus('Preset saved');
  }

  async function saveVersion(type = 'manual') {
    const agentId = agent?.id || card.musicAgentId;
    if (!agentId) return;
    await saveMusicVersion(agentId, {
      versionType: type,
      name: `${state.pattern.name} snapshot`,
      snapshot: state,
    });
    setVersions(await fetchMusicVersions(agentId));
    if (projectId) {
      await recordChronicleEvent(projectId, {
        sketchId: sketch?.id,
        agentId,
        eventType: 'version.saved',
        actorType: 'human',
        summary: `Saved ${type} version`,
        payload: { versionType: type },
      });
      await refreshChronicle();
    }
    setStatus('Version saved');
  }

  async function restoreVersion(versionId) {
    const agentId = agent?.id || card.musicAgentId;
    if (!agentId) return;
    const restored = await restoreMusicVersion(agentId, versionId);
    const restoredState = createDefaultBeatAgentState(restored.state);
    setAgent(restored);
    setState(restoredState);
    updateCardFromFullscreen(onUpdateCard, card.id, {
      musicState: restoredState,
      name: restoredState.name,
    });
    setVersions(await fetchMusicVersions(agentId));
    setStatus('Version restored');
  }

  async function loadPreset(presetId) {
    const preset = presets.find((candidate) => candidate.id === presetId);
    if (!preset?.preset) return;
    await saveVersion('preset-load');
    await persist(createDefaultBeatAgentState(preset.preset), 'Preset loaded');
  }

  async function importPackageFile(file) {
    if (!file || !projectId) return;
    const text = await file.text();
    const pkg = JSON.parse(text);
    const imported = await importMusicAgentPackage(projectId, pkg);
    setStatus(`Imported ${imported.name}`);
  }

  async function exportPackage() {
    const agentId = agent?.id || card.musicAgentId || card.versions?.[0]?.musicAgentId;
    if (!agentId) {
      downloadMusicArtifactPackage(agent ?? { ...card, state, projectId });
      return;
    }
    const pkg = await exportMusicAgent(agentId);
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${state.name || 'beat-agent'}.musicartifact.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus('Exported package');
  }

  async function mutate(mode) {
    await saveVersion('ai-variation');
    await persist(buildDeterministicBeatMutation(state, mode), 'Variation applied');
    if (projectId) {
      await recordChronicleEvent(projectId, {
        sketchId: sketch?.id,
        agentId: agent?.id || card.musicAgentId,
        eventType: 'ai.variation',
        actorType: 'ai',
        summary: `Generated ${mode} beat variation`,
        payload: { mode },
      });
      await refreshChronicle();
    }
  }

  function saveDescriptorGraph(nextGraph) {
    descriptorDirtyRef.current = true;
    setDescriptorGraph(nextGraph);
    const nextSpace = deriveSpaceFromDescriptors(spaceState, nextGraph);
    setSpaceState(nextSpace);
    const nextAgentState = createDefaultBeatAgentState({
      ...state,
      descriptorGraph: nextGraph,
      spaceState: nextSpace,
      updatedAt: new Date().toISOString(),
    });
    updateCardFromFullscreen(onUpdateCard, card.id, {
      descriptorGraph: nextGraph,
      spaceState: nextSpace,
      musicState: nextAgentState,
    });
    void persist(nextAgentState, 'Descriptors saved');
    const sequence = descriptorPersistSeqRef.current + 1;
    descriptorPersistSeqRef.current = sequence;
    const payload = {
      sequence,
      nextGraph,
      nextSpace,
    };
    pendingDescriptorPersistRef.current = payload;
    void persistDescriptorGraphDrivenStateRef.current?.(payload);
  }

  async function persistDescriptorGraphDrivenState({
    sequence,
    nextGraph,
    nextSpace,
  }) {
    if (sequence !== descriptorPersistSeqRef.current) return;
    pendingDescriptorPersistRef.current = null;

    if (projectId) {
      await saveProjectDescriptorGraph(projectId, nextGraph);
      await saveProjectSpaceState(projectId, nextSpace);
    }
    if (!sketch?.id) return;
    await saveSketchDescriptorGraph(sketch.id, nextGraph);
    const sonicTemporal = normalizeSonicTemporal(state.sonicTemporal);
    const reflection = analyzeMusicClutter({
      descriptorGraph: nextGraph,
      spaceState: nextSpace,
      temporalState: {
        wet: sonicTemporal.delay.wet,
        feedback: sonicTemporal.delay.feedback,
        topology: sonicTemporal.shimmer.enabled ? 'shimmer' : 'digital',
      },
      performerStates: [currentBeatPerformerSummary(state)],
    });
    if (projectId && reflection.risk === 'high') {
      await recordChronicleEvent(projectId, {
        sketchId: sketch.id,
        agentId: agent?.id || card.musicAgentId,
        eventType: 'reflection.clutter',
        actorType: 'system',
        summary: 'Reflection detected high temporal and spatial clutter',
        payload: reflection,
      });
    }
    const updatedSketch = await saveSonicSketch(projectId, {
      ...sketch,
      descriptorGraph: nextGraph,
      spaceState: nextSpace,
      sonicTemporal,
    });
    if (sequence !== descriptorPersistSeqRef.current) return;
    setSketch(updatedSketch);
    await refreshChronicle(updatedSketch.id);
  }

  persistDescriptorGraphDrivenStateRef.current = persistDescriptorGraphDrivenState;

  async function saveSpace(nextSpace) {
    const normalizedSpace = createDefaultSpaceState(nextSpace);
    setSpaceState(normalizedSpace);
    const nextAgentState = createDefaultBeatAgentState({
      ...state,
      spaceState: normalizedSpace,
      updatedAt: new Date().toISOString(),
    });
    updateCardFromFullscreen(onUpdateCard, card.id, {
      spaceState: normalizedSpace,
      musicState: nextAgentState,
    });
    void persist(nextAgentState, 'Space saved', { debounce: true });
    if (projectId) await saveProjectSpaceState(projectId, normalizedSpace);
    if (sketch?.id) {
      const updatedSketch = await saveSonicSketch(projectId, {
        ...sketch,
        spaceState: normalizedSpace,
      });
      setSketch(updatedSketch);
      await refreshChronicle(updatedSketch.id);
    }
  }

  async function saveSonicTemporalSettings(nextSonicTemporal) {
    updateAgentAudio({ sonicTemporal: normalizeSonicTemporal(nextSonicTemporal) }, { debounce: true });
  }

  return (
    <div className="h-full bg-[#101113] text-primary flex flex-col">
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-surface">
        <div className="min-w-0">
          <input
            value={state.name}
            onChange={(event) => setState((current) => ({ ...current, name: event.target.value }))}
            onBlur={() => void persist(state, 'Renamed')}
            className="serif text-xl bg-transparent border-0 border-b border-transparent focus:border-accent focus:outline-none text-primary"
          />
          <div className="sans text-[10px] uppercase tracking-wider text-muted">music-agent / beat</div>
        </div>
        <div className="flex flex-col items-end gap-1 min-w-0">
          {error && (
            <div className="sans text-xs text-danger max-w-md text-right truncate" title={error}>
              {error}
            </div>
          )}
          <BeatTransportStrip
            state={transport.state}
            onPlay={transport.play}
            onPreparePlay={prepareBeatAudio}
            onEnableAudio={enableBeatAudio}
            audioNeedsUnlock={audioContextState !== 'running'}
            onStop={transport.stop}
            onBpmChange={(bpm) => updateTransportSettings({ bpm })}
            clockSync={clockSync}
            onClockSyncToggle={() => toggleClockSync()}
          />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <section className="min-w-0 flex flex-col gap-4">
          <div className="border border-border rounded-lg bg-surface p-3">
            <div className="sans text-[10px] uppercase tracking-wider text-muted mb-3">Sequencer</div>
            <div className="grid gap-2">
              {state.pattern.tracks.map((track) => (
                <div key={track.id} className="grid grid-cols-[5rem_1fr] gap-2 items-center">
                  <div className="sans text-xs text-secondary truncate">{track.name}</div>
                  <div
                    className="grid gap-1"
                    style={{ gridTemplateColumns: `repeat(${state.pattern.stepCount}, minmax(0, 1fr))` }}
                  >
                    {track.steps.map((step, index) => (
                      <StepCell
                        key={`${track.id}-${index}`}
                        active={step.active}
                        velocity={step.velocity}
                        isPlayhead={transport.state.isPlaying && index === playhead}
                        onClick={() => toggleStep(track.id, index)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="border border-border rounded-lg bg-surface p-3">
            <div className="sans text-[10px] uppercase tracking-wider text-muted mb-3">
              Instrument Controls
            </div>
            {sonicLinkSummary.hasStale && (
              <div className="mb-3 rounded border border-warning/40 bg-warning/10 px-3 py-2 flex items-center justify-between gap-2">
                <div className="sans text-xs text-warning">
                  {sonicLinkSummary.staleTracks.length} Sonic voice
                  {sonicLinkSummary.staleTracks.length === 1 ? '' : 's'} changed since assign
                </div>
                <button
                  type="button"
                  className="sans text-xs border border-border rounded px-2 py-1"
                  onClick={refreshStaleSonicTracks}
                >
                  Refresh all
                </button>
              </div>
            )}
            {sonicLinkSummary.linkedCards.length > 0 && (
              <div className="sans text-[10px] text-muted mb-3">
                Canvas links: {sonicLinkSummary.linkedCards.map((linked) => linked.name ?? linked.id).join(', ')}
              </div>
            )}
            <div className="grid gap-3 xl:grid-cols-2">
              <label className="sans text-xs text-secondary flex items-center gap-2 xl:col-span-2">
                <input
                  type="checkbox"
                  checked={copyTemporalOnAssign}
                  onChange={(event) => setCopyTemporalOnAssign(event.target.checked)}
                />
                Copy temporal settings when assigning Sonic voice
              </label>
              {state.pattern.tracks.map((track) => (
                <BeatTrackSoundControls
                  key={`${track.id}-sound`}
                  track={track}
                  cards={cards}
                  isolatedTrackId={isolatedTrackId}
                  onToggleIsolate={toggleTrackIsolate}
                  copyTemporalOnAssign={copyTemporalOnAssign}
                  onCopyTemporal={(temporal) => {
                    const normalized = normalizeSonicTemporal(temporal);
                    updateAgentAudio({
                      sonicTemporal: normalized,
                      audioRouting: createDefaultBeatAudioRouting({
                        ...state.audioRouting,
                        sonicTemporalBypass: normalized.enabled === false,
                      }),
                    }, { debounce: true });
                  }}
                  onWireSonicLink={wireSonicLink}
                  onSyncToCard={syncTrackVoiceToSonicCard}
                  onChange={(nextTrack) => updateTrackSound(track.id, nextTrack, { debounce: true })}
                />
              ))}
            </div>
          </div>
          <DescriptorGraphPanel
            descriptorGraph={descriptorGraph}
            audioRouting={state.audioRouting}
            onChange={(nextGraph) => { void saveDescriptorGraph(nextGraph); }}
            onChangeAudioRouting={(nextRouting) => updateAgentAudio(
              { audioRouting: nextRouting },
              { debounce: true },
            )}
          />
          <ExplorationWorkspace
            sketches={sketches}
            clusters={clusters}
            activeSketchId={sketch?.id}
            onSelectSketch={(nextSketch) => {
              setSketch(nextSketch);
              setDescriptorGraph(createDefaultDescriptorGraph(nextSketch.descriptorGraph));
              setSpaceState(createDefaultSpaceState(nextSketch.spaceState));
              void refreshChronicle(nextSketch.id);
            }}
          />
        </section>
        <aside className="flex flex-col gap-3 min-w-0">
          <BeatSonicTemporalPanel
            sonicTemporal={state.sonicTemporal}
            audioRouting={state.audioRouting}
            mixSettings={state.mixSettings}
            cards={cards}
            onChangeTemporalActive={(active) => setTemporalActive(active, { debounce: true })}
            onChangeSonicTemporal={saveSonicTemporalSettings}
            onChangeAudioRouting={(nextRouting) => updateAgentAudio({ audioRouting: nextRouting }, { debounce: true })}
            onChangeMixSettings={(nextMix) => updateAgentAudio({ mixSettings: nextMix }, { debounce: true })}
            onImportFromCard={(sonicCard) => {
              const imported = sonicCard?.sonicStudioState?.temporal;
              if (!imported) return;
              const normalized = normalizeSonicTemporal(imported);
              updateAgentAudio({
                sonicTemporal: normalized,
                audioRouting: createDefaultBeatAudioRouting({
                  ...state.audioRouting,
                  sonicTemporalBypass: normalized.enabled === false,
                }),
              }, { debounce: true });
            }}
          />
          <SpacePanel
            spaceState={spaceState}
            descriptorGraph={descriptorGraph}
            audioRouting={state.audioRouting}
            onChange={(nextSpace) => { void saveSpace(nextSpace); }}
            onChangeAudioRouting={(nextRouting) => updateAgentAudio({ audioRouting: nextRouting }, { debounce: true })}
          />
          <ReflectionPanel
            descriptorGraph={descriptorGraph}
            spaceState={spaceState}
            temporalState={{
              wet: state.sonicTemporal?.delay?.wet ?? 0.18,
              feedback: state.sonicTemporal?.delay?.feedback ?? 0.28,
              topology: state.sonicTemporal?.shimmer?.enabled ? 'shimmer' : 'digital',
            }}
            performerStates={[currentBeatPerformerSummary(state)]}
          />
          <ChronicleTimeline events={chronicleEvents} />
          <div className="border border-border rounded-lg bg-surface p-3 flex flex-col gap-3">
          <button type="button" className="sans text-xs bg-accent text-on-accent rounded px-3 py-2" onClick={savePreset}>
            Save Preset
          </button>
          <select
            className="sans text-xs bg-surface-muted border border-border rounded px-2 py-2"
            value=""
            onChange={(event) => {
              if (event.target.value) void loadPreset(event.target.value);
            }}
          >
            <option value="">Load preset...</option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.name}</option>
            ))}
          </select>
          <button type="button" className="sans text-xs border border-border rounded px-3 py-2" onClick={() => void saveVersion()}>
            Save Version
          </button>
          <select
            className="sans text-xs bg-surface-muted border border-border rounded px-2 py-2"
            value=""
            onChange={(event) => {
              if (event.target.value) void restoreVersion(event.target.value);
            }}
          >
            <option value="">Restore version...</option>
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.name} ({version.versionType})
              </option>
            ))}
          </select>
          <button type="button" className="sans text-xs border border-border rounded px-3 py-2" onClick={() => void mutate('similar')}>
            Generate Similar
          </button>
          <button type="button" className="sans text-xs border border-border rounded px-3 py-2" onClick={() => void mutate('wild')}>
            Generate Wild
          </button>
          <button
            type="button"
            className="sans text-xs border border-border rounded px-3 py-2"
            onClick={() => void exportPackage()}
          >
            Export .musicartifact
          </button>
          <label className="sans text-xs border border-border rounded px-3 py-2 text-center cursor-pointer">
            Import .musicartifact
            <input
              type="file"
              accept=".json,.musicartifact,application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                void importPackageFile(file);
              }}
            />
          </label>
          <div className="border-t border-border pt-3">
            <div className="sans text-[10px] uppercase tracking-wider text-muted mb-2">Effects</div>
            <div className="sans text-xs text-muted">
              Sonic temporal FX {
                state.audioRouting?.sonicTemporalBypass || state.sonicTemporal?.enabled === false
                  ? 'bypassed'
                  : 'active'
              }
              {' · '}
              Acoustic space {
                spaceState?.roomIdentity === 'void'
                  ? 'void (dry)'
                  : state.audioRouting?.acousticSpaceBypass
                    ? 'bypassed'
                    : 'active'
              }
              {' · '}
              Descriptor graph {state.audioRouting?.descriptorGraphBypass === false ? 'modulating' : 'bypassed'}
            </div>
          </div>
          {status && <div className="sans text-xs text-warning">{status}</div>}
          </div>
        </aside>
      </div>
    </div>
  );
}

function currentBeatPerformerSummary(state) {
  const pattern = state?.pattern;
  if (!pattern?.tracks?.length) return { density: 0 };
  return {
    density: pattern.tracks.reduce((sum, track) => (
      sum + track.steps.filter((step) => step.active).length / Math.max(1, pattern.stepCount)
    ), 0) / Math.max(1, pattern.tracks.length),
  };
}
