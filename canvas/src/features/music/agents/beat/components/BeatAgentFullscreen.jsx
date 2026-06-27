import React, { useEffect, useRef, useState } from 'react';
import { createDefaultBeatAgentState } from '../domain/beatAgentState.js';
import { buildDeterministicBeatMutation } from '../domain/beatAi.js';
import { BeatTransportStrip } from '../../../transport/BeatTransportStrip.jsx';
import {
  fetchChronicleEvents,
  fetchMusicPresets,
  fetchMusicVersions,
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
  saveTemporalSketch,
} from '../../../api/musicApi.js';
import {
  createDefaultDescriptorGraph,
  createDefaultSpaceState,
  createDefaultTemporalState,
  analyzeMusicClutter,
  deriveSpaceFromDescriptors,
  deriveTemporalFromDescriptors,
} from '../../../../../../packages/music-core/src/index.js';
import { downloadMusicArtifactPackage } from '../../../serialization/musicArtifactPackage.js';
import { useBeatAgentRuntime } from '../hooks/useBeatAgentRuntime.js';
import { BeatTrackSynthControls } from './BeatTrackSynthControls.jsx';
import { DescriptorGraphPanel } from '../../../descriptors/DescriptorGraphPanel.jsx';
import { ChronicleTimeline } from '../../../chronicle/ChronicleTimeline.jsx';
import { SpacePanel } from '../../../space/SpacePanel.jsx';
import { TemporalPanel } from '../../../temporal/TemporalPanel.jsx';
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

export function BeatAgentFullscreen({ card, projectId, folderHandle = null, onUpdateCard }) {
  const [presets, setPresets] = useState([]);
  const [versions, setVersions] = useState([]);
  const [sketch, setSketch] = useState(null);
  const [sketches, setSketches] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [chronicleEvents, setChronicleEvents] = useState([]);
  const [descriptorGraph, setDescriptorGraph] = useState(() => createDefaultDescriptorGraph(
    card.musicState?.descriptorGraph ?? card.descriptorGraph,
  ));
  const [spaceState, setSpaceState] = useState(() => createDefaultSpaceState(
    card.musicState?.spaceState ?? card.spaceState,
  ));
  const [temporalState, setTemporalState] = useState(() => createDefaultTemporalState(
    card.musicState?.temporalState ?? card.temporalState,
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
    transport,
    playhead,
    toggleStep,
    updateTrackSynth,
    updateTransportSettings,
    clockSync,
    toggleClockSync,
    persist,
  } = useBeatAgentRuntime({
    card,
    projectId,
    folderHandle,
    onUpdateCard,
    temporalState,
  });

  useEffect(() => {
    if (!projectId) return;
    fetchMusicPresets(projectId).then(setPresets).catch(() => {});
    fetchSketchClusters(projectId).then(setClusters).catch(() => {});
    fetchSonicSketches(projectId).then(setSketches).catch(() => {});
    fetchProjectSpaceState(projectId).then(setSpaceState).catch(() => {});
    fetchChronicleEvents(projectId).then(setChronicleEvents).catch(() => {});
  }, [projectId]);

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
          setDescriptorGraph(createDefaultDescriptorGraph(loadedSketch.descriptorGraph));
          setSpaceState(createDefaultSpaceState(loadedSketch.spaceState));
          setTemporalState(createDefaultTemporalState(loadedSketch.temporalState));
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
    const nextTemporal = deriveTemporalFromDescriptors(temporalState, nextGraph);
    setSpaceState(nextSpace);
    setTemporalState(nextTemporal);
    const nextAgentState = createDefaultBeatAgentState({
      ...state,
      descriptorGraph: nextGraph,
      spaceState: nextSpace,
      temporalState: nextTemporal,
      updatedAt: new Date().toISOString(),
    });
    updateCardFromFullscreen(onUpdateCard, card.id, {
      descriptorGraph: nextGraph,
      spaceState: nextSpace,
      temporalState: nextTemporal,
      musicState: nextAgentState,
    });
    void persist(nextAgentState, 'Descriptors saved');
    const sequence = descriptorPersistSeqRef.current + 1;
    descriptorPersistSeqRef.current = sequence;
    const payload = {
      sequence,
      nextGraph,
      nextSpace,
      nextTemporal,
    };
    pendingDescriptorPersistRef.current = payload;
    void persistDescriptorGraphDrivenStateRef.current?.(payload);
  }

  async function persistDescriptorGraphDrivenState({
    sequence,
    nextGraph,
    nextSpace,
    nextTemporal,
  }) {
    if (sequence !== descriptorPersistSeqRef.current) return;
    pendingDescriptorPersistRef.current = null;

    if (projectId) {
      await saveProjectDescriptorGraph(projectId, nextGraph);
      await saveProjectSpaceState(projectId, nextSpace);
    }
    if (!sketch?.id) return;
    await saveSketchDescriptorGraph(sketch.id, nextGraph);
    const savedTemporal = projectId
      ? await saveTemporalSketch(projectId, {
        id: temporalSketches[0]?.id,
        sketchId: sketch.id,
        name: `${nextTemporal.topology} Temporal Sketch`,
        topology: nextTemporal.topology,
        state: nextTemporal,
        descriptorMappings: nextGraph,
      })
      : null;
    if (savedTemporal) {
      setTemporalSketches((current) => [savedTemporal, ...current.filter((item) => item.id !== savedTemporal.id)]);
    }
    const reflection = analyzeMusicClutter({
      descriptorGraph: nextGraph,
      spaceState: nextSpace,
      temporalState: nextTemporal,
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
      temporalState: nextTemporal,
    });
    if (sequence !== descriptorPersistSeqRef.current) return;
    setSketch(updatedSketch);
    await refreshChronicle(updatedSketch.id);
  }

  persistDescriptorGraphDrivenStateRef.current = persistDescriptorGraphDrivenState;

  async function saveSpace(nextSpace) {
    setSpaceState(nextSpace);
    if (projectId) await saveProjectSpaceState(projectId, nextSpace);
    if (sketch?.id) {
      const updatedSketch = await saveSonicSketch(projectId, {
        ...sketch,
        spaceState: nextSpace,
      });
      setSketch(updatedSketch);
      await refreshChronicle(updatedSketch.id);
    }
  }

  async function saveTemporal(nextTemporal) {
    setTemporalState(nextTemporal);
    if (!projectId) return;
    const savedTemporal = await saveTemporalSketch(projectId, {
      id: temporalSketches[0]?.id,
      sketchId: sketch?.id,
      name: `${nextTemporal.topology} Temporal Sketch`,
      topology: nextTemporal.topology,
      state: nextTemporal,
      descriptorMappings: descriptorGraph,
    });
    setTemporalSketches((current) => [savedTemporal, ...current.filter((item) => item.id !== savedTemporal.id)]);
    if (sketch?.id) {
      const updatedSketch = await saveSonicSketch(projectId, {
        ...sketch,
        temporalState: nextTemporal,
      });
      setSketch(updatedSketch);
      await refreshChronicle(updatedSketch.id);
    }
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
        <BeatTransportStrip
          state={transport.state}
          onPlay={transport.play}
          onStop={transport.stop}
          onBpmChange={(bpm) => updateTransportSettings({ bpm })}
          clockSync={clockSync}
          onClockSyncToggle={() => toggleClockSync()}
        />
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <section className="min-w-0">
          <div className="mb-4 grid gap-4 2xl:grid-cols-[minmax(0,1fr)_20rem]">
            <DescriptorGraphPanel
              descriptorGraph={descriptorGraph}
              onChange={(nextGraph) => { void saveDescriptorGraph(nextGraph); }}
            />
            <ExplorationWorkspace
              sketches={sketches}
              clusters={clusters}
              activeSketchId={sketch?.id}
              onSelectSketch={(nextSketch) => {
                setSketch(nextSketch);
                setDescriptorGraph(createDefaultDescriptorGraph(nextSketch.descriptorGraph));
                setSpaceState(createDefaultSpaceState(nextSketch.spaceState));
                setTemporalState(createDefaultTemporalState(nextSketch.temporalState));
                void refreshChronicle(nextSketch.id);
              }}
            />
          </div>
          <div className="border border-border rounded-lg bg-surface p-3">
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
          <div className="mt-4 border border-border rounded-lg bg-surface p-3">
            <div className="sans text-[10px] uppercase tracking-wider text-muted mb-3">
              Instrument Controls
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              {state.pattern.tracks.map((track) => (
                <div key={`${track.id}-synth`} className="min-w-0 border border-border bg-surface-muted rounded p-3">
                  <div className="sans text-xs text-primary mb-2 truncate">{track.name}</div>
                  <BeatTrackSynthControls
                    track={track}
                    onChange={(trackId, patch) => updateTrackSynth(trackId, patch, { debounce: true })}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
        <aside className="flex flex-col gap-3 min-w-0">
          <SpacePanel
            spaceState={spaceState}
            descriptorGraph={descriptorGraph}
            onChange={(nextSpace) => { void saveSpace(nextSpace); }}
          />
          <TemporalPanel
            temporalState={temporalState}
            descriptorGraph={descriptorGraph}
            onChange={(nextTemporal) => { void saveTemporal(nextTemporal); }}
          />
          <ReflectionPanel
            descriptorGraph={descriptorGraph}
            spaceState={spaceState}
            temporalState={temporalState}
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
              Shared {temporalState.topology} delay bus active: {Math.round(temporalState.wet * 100)}% wet,
              {Math.round(temporalState.feedback * 100)}% feedback.
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
