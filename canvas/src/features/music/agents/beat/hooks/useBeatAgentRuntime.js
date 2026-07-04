import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createDefaultBeatAgentState,
  summarizeBeatBlackboard,
  validateBeatAgentState,
} from '../domain/beatAgentState.js';
import {
  createDefaultSpaceState,
} from '../../../../../../packages/music-core/src/index.js';
import {
  resolveBeatAgentId,
  toggleBeatAgentStepState,
  updateBeatTransportSettingsState,
  updateBeatTrackSynthState,
  updateBeatAgentAudioState,
  updateBeatAgentTemporalActiveState,
  updateBeatTrackSoundState,
} from '../domain/beatRuntimeState.js';
import {
  applyBeatClockTransportSettings,
  bindBeatRuntimeTransport,
  startBeatWorkletSession,
  stripBeatLiveTransportState,
  updateBeatWorkletAgent,
} from '../domain/beatClockSync.js';
import {
  applySyncedBeatTransportSettings,
  playAllSyncedBeatAgents,
  registerBeatClockSyncEntry,
  stopSyncedBeatAgent,
} from '../domain/beatClockCoordinator.js';
import {
  ensureBeatPreviewTransport,
} from '../domain/beatPreviewTransport.js';
import { BeatEngine } from '../engine/BeatEngine.js';
import { useMusicKernel } from '../../../kernel/MusicKernelProvider.jsx';
import { useUniversalMusicTransport } from '../../../transport/useUniversalMusicTransport.js';
import {
  fetchMusicAgent,
  saveMusicBlackboard,
  saveProjectMusicTransport,
  updateMusicAgent,
} from '../../../api/musicApi.js';
import {
  ensureWritePermission,
  isFolderHandleStaleUserError,
  overwriteTextFileAtPath,
} from '../../../../../lib/folderWrite.js';
import { getCachedFolderHandle } from '../../../../../lib/folderSessionCache.js';
import { sweepStaleBeatTracksInState } from '../domain/sweepStaleBeatTracksFromCards.js';
import { pickNewestDescriptorGraph } from '../../../descriptors/descriptorGraphPersistence.js';

const beatRuntimeEntries = new Map();

function createRuntimeEntry(key) {
  const entry = {
    key,
    refs: 0,
    workletRefs: 0,
    registeredAudioTransport: null,
    latestState: null,
    latestTemporalState: null,
    isolatedTrackId: null,
    cleanupTimer: null,
    previewTransport: null,
    engine: null,
    stateListeners: new Set(),
  };
  entry.engine = new BeatEngine({
    getState: () => entry.latestState,
    getTemporalState: () => entry.latestTemporalState,
  });
  return entry;
}

function getRuntimeEntry(key) {
  const runtimeKey = key || 'beat-runtime-anonymous';
  let entry = beatRuntimeEntries.get(runtimeKey);
  if (!entry) {
    entry = createRuntimeEntry(runtimeKey);
    beatRuntimeEntries.set(runtimeKey, entry);
  }
  if (entry.cleanupTimer) {
    window.clearTimeout(entry.cleanupTimer);
    entry.cleanupTimer = null;
  }
  return entry;
}

function releaseRuntimeEntry(entry) {
  entry.refs = Math.max(0, entry.refs - 1);
  if (entry.refs > 0 || entry.cleanupTimer) return;
  entry.cleanupTimer = window.setTimeout(() => {
    entry.cleanupTimer = null;
    if (entry.refs > 0) return;
    entry.unsubscribeSteps?.();
    entry.unsubscribeSteps = null;
    entry.activeTransport = null;
    entry.previewTransport?.stop();
    entry.previewTransport = null;
    entry.engine.stop();
    beatRuntimeEntries.delete(entry.key);
  }, 1000);
}

function stateTimestamp(state) {
  const value = Date.parse(state?.updatedAt ?? state?.pattern?.updatedAt ?? '');
  return Number.isFinite(value) ? value : 0;
}

function newestBeatState(current, candidate) {
  if (!current) return candidate;
  if (!candidate) return current;
  return stateTimestamp(candidate) >= stateTimestamp(current) ? candidate : current;
}

function publishRuntimeState(entry, nextState) {
  const canonicalState = newestBeatState(entry.latestState, nextState);
  entry.latestState = canonicalState;
  for (const listener of entry.stateListeners ?? []) {
    listener(canonicalState);
  }
  return canonicalState;
}

export function buildBeatSonicCardsSignature(cards = []) {
  if (!cards.length) return '';
  return JSON.stringify(cards.map((card) => ({
    id: card.id,
    hash: card.sonicSourceStateHash,
    assets: (card.sonicRenderedAssets ?? []).map((asset) => asset.sourceStateHash),
  })));
}

function defaultBeatStateFromCard(card) {
  if (card?.musicState) {
    return createDefaultBeatAgentState(card.musicState);
  }
  return createDefaultBeatAgentState({
    name: card?.name,
    updatedAt: '1970-01-01T00:00:00.000Z',
  });
}

function enrichBeatAgentStateForPersist(nextState, {
  descriptorGraph = null,
  spaceState = null,
} = {}) {
  const patch = { ...nextState };
  if (descriptorGraph || nextState.descriptorGraph) {
    patch.descriptorGraph = pickNewestDescriptorGraph(descriptorGraph, nextState.descriptorGraph);
  }
  const resolvedSpace = spaceState ?? nextState.spaceState;
  if (resolvedSpace) {
    patch.spaceState = createDefaultSpaceState(resolvedSpace);
  }
  return createDefaultBeatAgentState(patch);
}

function updateCardFromRuntime(onUpdateCard, cardId, updates) {
  if (!onUpdateCard || !cardId) return;
  if (onUpdateCard.length >= 2) {
    onUpdateCard(cardId, updates);
  } else {
    onUpdateCard(updates);
  }
}

export function resolveEffectiveAudioContext({
  state,
  sonicTemporal = null,
  spaceState = null,
  descriptorGraph = null,
  audioRouting = null,
  mixSettings = null,
  card = null,
} = {}) {
  return {
    sonicTemporal: sonicTemporal ?? state?.sonicTemporal,
    spaceState: createDefaultSpaceState(
      spaceState
      ?? state?.spaceState
      ?? card?.musicState?.spaceState
      ?? card?.spaceState
      ?? null,
    ),
    descriptorGraph: pickNewestDescriptorGraph(
      descriptorGraph,
      state?.descriptorGraph,
      card?.musicState?.descriptorGraph,
      card?.descriptorGraph,
    ),
    audioRouting: audioRouting ?? state?.audioRouting,
    mixSettings: mixSettings ?? state?.mixSettings,
  };
}

export function useBeatAgentRuntime({
  card,
  cards = [],
  projectId = null,
  folderHandle = null,
  onUpdateCard = null,
  debounceMs = 0,
  sonicTemporal = null,
  spaceState = null,
  audioRouting = null,
  mixSettings = null,
  descriptorGraph = null,
} = {}) {
  const runtimeKey = resolveBeatAgentId(card) || card?.id || card?.key;
  const cardId = card?.id;
  const agentId = resolveBeatAgentId(card);
  const initialCardState = useMemo(
    () => defaultBeatStateFromCard(card),
    [card?.id, card?.musicState, card?.name],
  );
  const runtimeEntryRef = useRef(null);
  if (!runtimeEntryRef.current || runtimeEntryRef.current.key !== (runtimeKey || 'beat-runtime-anonymous')) {
    runtimeEntryRef.current = getRuntimeEntry(runtimeKey);
    runtimeEntryRef.current.latestState = newestBeatState(
      runtimeEntryRef.current.latestState,
      initialCardState,
    );
  }
  const runtimeEntry = runtimeEntryRef.current;
  const [agent, setAgent] = useState(null);
  const [state, setState] = useState(() => runtimeEntry.latestState ?? initialCardState);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isolatedTrackId, setIsolatedTrackId] = useState(() => runtimeEntry.isolatedTrackId ?? null);
  const stateRef = useRef(state);
  const sonicTemporalRef = useRef(sonicTemporal);
  const spaceStateRef = useRef(spaceState);
  const audioRoutingRef = useRef(audioRouting);
  const mixSettingsRef = useRef(mixSettings);
  const descriptorGraphRef = useRef(descriptorGraph);
  const agentRef = useRef(agent);
  const cardRef = useRef(card);
  const saveTimerRef = useRef(null);
  const pendingStateRef = useRef(null);
  const persistToBackendsRef = useRef(null);
  const appliedTransportRevisionRef = useRef(null);

  stateRef.current = state;
  sonicTemporalRef.current = sonicTemporal ?? state.sonicTemporal;
  spaceStateRef.current = spaceState;
  audioRoutingRef.current = audioRouting ?? state.audioRouting;
  mixSettingsRef.current = mixSettings ?? state.mixSettings;
  descriptorGraphRef.current = descriptorGraph;
  agentRef.current = agent;
  cardRef.current = card;

  const resolveAudioContext = useCallback((overrides = {}) => resolveEffectiveAudioContext({
    state: stateRef.current,
    sonicTemporal: overrides.sonicTemporal ?? sonicTemporalRef.current,
    spaceState: overrides.spaceState ?? spaceStateRef.current,
    descriptorGraph: overrides.descriptorGraph ?? descriptorGraphRef.current,
    audioRouting: overrides.audioRouting ?? audioRoutingRef.current,
    mixSettings: overrides.mixSettings ?? mixSettingsRef.current,
    card: overrides.card ?? cardRef.current,
  }), []);

  runtimeEntry.latestState = newestBeatState(runtimeEntry.latestState, state);
  const cardsSignature = useMemo(() => buildBeatSonicCardsSignature(cards), [cards]);
  const kernel = useMusicKernel();
  const universalTransport = useUniversalMusicTransport();
  const previewTransport = ensureBeatPreviewTransport(runtimeEntry, kernel.audioEngine);
  const clockSync = Boolean(state.clockSync);
  const activeAudioTransport = previewTransport;
  const [previewTransportState, setPreviewTransportState] = useState(
    () => previewTransport.transportState,
  );
  const [audioContextState, setAudioContextState] = useState(
    () => kernel.audioEngine.getContextState?.() ?? 'none',
  );

  useEffect(
    () => previewTransport.subscribeTransportState(setPreviewTransportState),
    [previewTransport],
  );

  useEffect(() => {
    const unsubscribe = kernel.audioEngine.subscribeContextState?.(setAudioContextState);
    return () => unsubscribe?.();
  }, [kernel.audioEngine]);

  const transportState = previewTransportState;
  const setActiveTransportState = useCallback((patch) => {
    previewTransport.setTransportSettings(patch);
    if (clockSync) {
      applySyncedBeatTransportSettings({
        ...stateRef.current.transport,
        ...patch,
      });
      universalTransport.setTransportState(patch);
    }
  }, [clockSync, previewTransport, universalTransport]);

  useEffect(() => {
    const listener = (nextState) => {
      setState((current) => {
        const merged = newestBeatState(nextState, current);
        return merged === current ? current : merged;
      });
    };
    runtimeEntry.stateListeners.add(listener);
    if (runtimeEntry.latestState) {
      listener(runtimeEntry.latestState);
    }
    return () => runtimeEntry.stateListeners.delete(listener);
  }, [runtimeEntry]);

  useEffect(() => {
    runtimeEntry.refs += 1;
    return () => releaseRuntimeEntry(runtimeEntry);
  }, [runtimeEntry]);

  useEffect(() => {
    if (!clockSync || !runtimeKey) return undefined;
    return registerBeatClockSyncEntry(runtimeKey, { previewTransport });
  }, [clockSync, previewTransport, runtimeKey]);

  useEffect(() => {
    if (!clockSync) return;
    const settings = stripBeatLiveTransportState(state.transport ?? {});
    applyBeatClockTransportSettings(previewTransport, settings);
    applySyncedBeatTransportSettings(settings);
    applyBeatClockTransportSettings(universalTransport.transport, settings);
  }, [clockSync, previewTransport, state.transport, universalTransport.transport]);

  useEffect(() => {
    if (!activeAudioTransport?.applyBeatAudioRouting) return;
    const audioContext = resolveAudioContext();
    activeAudioTransport.applyBeatAudioRouting(audioContext);
  }, [
    activeAudioTransport,
    resolveAudioContext,
    sonicTemporal,
    spaceState,
    audioRouting,
    mixSettings,
    descriptorGraph,
    state.sonicTemporal,
    state.audioRouting,
    state.mixSettings,
    state.descriptorGraph,
    state.spaceState,
    card?.id,
    card?.descriptorGraph,
    card?.spaceState,
    card?.musicState?.descriptorGraph,
    card?.musicState?.spaceState,
  ]);

  useEffect(() => {
    bindBeatRuntimeTransport(runtimeEntry);
  }, [runtimeEntry]);

  useEffect(() => {
    if (!runtimeKey) return undefined;
    let cancelled = false;
    let release = () => {};
    void startBeatWorkletSession(
      runtimeEntry,
      activeAudioTransport,
      runtimeKey,
      runtimeEntry.latestState ?? stateRef.current,
      {
        cards: cardsRef.current,
        ...(() => {
          const audioContext = resolveAudioContext();
          return {
            descriptorGraph: audioContext.descriptorGraph,
            audioRouting: audioContext.audioRouting,
          };
        })(),
      },
    )
      .then((cleanup) => {
        if (cancelled) {
          cleanup();
          return;
        }
        release = cleanup;
      })
      .catch((syncError) => {
        const reason = syncError?.message ?? 'Could not initialize beat audio';
        setError(reason);
        setStatus(reason);
      });
    return () => {
      cancelled = true;
      release();
    };
  }, [
    activeAudioTransport,
    clockSync,
    runtimeEntry,
    runtimeKey,
    resolveAudioContext,
  ]);

  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const syncWorkletAudioRef = useRef(null);

  const syncWorkletAudio = useCallback((nextState) => {
    if (!runtimeKey) return;
    const audioContext = resolveAudioContext();
    void updateBeatWorkletAgent(activeAudioTransport, runtimeKey, nextState, {
      cards: cardsRef.current,
      descriptorGraph: audioContext.descriptorGraph,
      audioRouting: audioContext.audioRouting,
      isolatedTrackId: runtimeEntry.isolatedTrackId ?? null,
    });
  }, [activeAudioTransport, resolveAudioContext, runtimeEntry, runtimeKey]);
  syncWorkletAudioRef.current = syncWorkletAudio;

  useEffect(() => {
    if (!runtimeKey) return;
    const payloadState = runtimeEntry.latestState ?? stateRef.current;
    const audioContext = resolveAudioContext();
    void updateBeatWorkletAgent(activeAudioTransport, runtimeKey, payloadState, {
      cards: cardsRef.current,
      descriptorGraph: audioContext.descriptorGraph,
      audioRouting: audioContext.audioRouting,
      isolatedTrackId: runtimeEntry.isolatedTrackId ?? null,
    });
  }, [
    activeAudioTransport,
    clockSync,
    runtimeKey,
    state,
    isolatedTrackId,
    cardsSignature,
    runtimeEntry,
    descriptorGraph,
    state.audioRouting,
    state.descriptorGraph,
    state.spaceState,
    resolveAudioContext,
    card?.id,
    card?.descriptorGraph,
    card?.spaceState,
    card?.musicState?.descriptorGraph,
    card?.musicState?.spaceState,
  ]);

  const clearStatusSoon = useCallback(() => {
    window.setTimeout(() => setStatus(''), 2500);
  }, []);

  const persistToBackends = useCallback(async (nextState, message = 'Saved') => {
    const enrichedState = enrichBeatAgentStateForPersist(nextState, {
      descriptorGraph: descriptorGraphRef.current,
      spaceState: spaceStateRef.current,
    });
    const validation = validateBeatAgentState(enrichedState);
    if (!validation.ok) {
      setError(validation.reason);
      setStatus(validation.reason);
      return false;
    }

    const currentAgentId = agentRef.current?.id || agentId;
    if (!currentAgentId) {
      setStatus(message);
      clearStatusSoon();
      return true;
    }

    setSaving(true);
    setError('');
    try {
      const saved = await updateMusicAgent(currentAgentId, {
        name: enrichedState.name,
        status: enrichedState.status,
        state: enrichedState,
      });
      setAgent(saved);
      if (projectId) {
        await saveMusicBlackboard(projectId, {
          [saved.id]: summarizeBeatBlackboard(enrichedState),
        });
      }
      const writeHandle = getCachedFolderHandle(projectId) ?? folderHandle;
      if (writeHandle && await ensureWritePermission(writeHandle)) {
        try {
          const basePath = saved.filePath ?? `music/beat-agent-${saved.id}`;
          await overwriteTextFileAtPath(
            writeHandle,
            `${basePath}/beat.agent.json`,
            JSON.stringify(enrichedState, null, 2),
            { projectId },
          );
          await overwriteTextFileAtPath(
            writeHandle,
            `${basePath}/current.pattern.json`,
            JSON.stringify(enrichedState.pattern, null, 2),
            { projectId },
          );
        } catch (folderError) {
          if (isFolderHandleStaleUserError(folderError)) {
            setError(folderError.message);
          }
          setStatus(message);
          clearStatusSoon();
          return true;
        }
      }
      setStatus(message);
      clearStatusSoon();
      return true;
    } catch (persistError) {
      const reason = persistError?.message ?? 'Could not save Beat Agent';
      setError(reason);
      setStatus(reason);
      return false;
    } finally {
      setSaving(false);
    }
  }, [agentId, clearStatusSoon, folderHandle, projectId]);
  persistToBackendsRef.current = persistToBackends;

  const applyState = useCallback((nextState) => {
    const enrichedState = enrichBeatAgentStateForPersist(nextState, {
      descriptorGraph: descriptorGraphRef.current,
      spaceState: spaceStateRef.current,
    });
    const canonicalState = publishRuntimeState(runtimeEntry, enrichedState);
    stateRef.current = canonicalState;
    setState(canonicalState);
    updateCardFromRuntime(onUpdateCard, cardId, {
      musicState: canonicalState,
      descriptorGraph: canonicalState.descriptorGraph,
      spaceState: canonicalState.spaceState,
      name: canonicalState.name,
    });
    syncWorkletAudioRef.current?.(canonicalState);
  }, [cardId, onUpdateCard, runtimeEntry]);

  const persistNow = useCallback(async (nextState = stateRef.current, message = 'Saved') => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      pendingStateRef.current = null;
    }
    applyState(nextState);
    return persistToBackends(nextState, message);
  }, [applyState, persistToBackends]);

  const schedulePersist = useCallback((nextState, message) => {
    applyState(nextState);
    pendingStateRef.current = { state: nextState, message };
    setError('');
    setStatus('Saving...');
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      const pending = pendingStateRef.current;
      pendingStateRef.current = null;
      saveTimerRef.current = null;
      if (!pending) return;
      if (stateTimestamp(pending.state) < stateTimestamp(runtimeEntry.latestState)) {
        setStatus('Saved');
        return;
      }
      void persistToBackends(pending.state, pending.message);
    }, debounceMs);
  }, [applyState, debounceMs, persistToBackends]);

  const persist = useCallback((nextState, message = 'Saved', options = {}) => {
    if (options.debounce && debounceMs > 0) {
      schedulePersist(nextState, message);
      return Promise.resolve(true);
    }
    return persistNow(nextState, message);
  }, [debounceMs, persistNow, schedulePersist]);

  useEffect(() => {
    if (!cardsSignature || !cardsRef.current.length) return;
    const { state: swept, changed, refreshedTrackIds } = sweepStaleBeatTracksInState(
      runtimeEntry.latestState ?? stateRef.current,
      cardsRef.current,
    );
    if (!changed) return;
    const message = refreshedTrackIds.length === 1
      ? 'Sonic voice refreshed'
      : `Refreshed ${refreshedTrackIds.length} Sonic voices`;
    void persist(swept, message, { debounce: true });
  }, [cardsSignature, persist, runtimeEntry]);

  const toggleStep = useCallback((trackId, index, options = {}) => {
    const result = toggleBeatAgentStepState(stateRef.current, trackId, index);
    if (!result.ok) {
      setError(result.reason);
      setStatus(result.reason);
      return;
    }
    void persist(result.state, 'Pattern saved', options);
  }, [persist]);

  const toggleClockSync = useCallback(async () => {
    const enabled = !stateRef.current.clockSync;
    const nextState = {
      ...stateRef.current,
      clockSync: enabled,
      updatedAt: new Date().toISOString(),
    };
    applyState(nextState);
    if (enabled) {
      try {
        await previewTransport.ensureReady();
        const transport = stripBeatLiveTransportState(nextState.transport ?? {});
        applyBeatClockTransportSettings(previewTransport, transport);
        applySyncedBeatTransportSettings(transport);
        await universalTransport.transport.ensureReady();
        applyBeatClockTransportSettings(universalTransport.transport, transport);
      } catch (syncError) {
        const reason = syncError?.message ?? 'Could not initialize clock sync audio';
        const reverted = {
          ...stateRef.current,
          clockSync: false,
          updatedAt: new Date().toISOString(),
        };
        applyState(reverted);
        setError(reason);
        setStatus(reason);
        return;
      }
    } else {
      previewTransport.stop();
    }
    await persistNow(
      runtimeEntry.latestState,
      enabled ? 'Clock sync enabled' : 'Clock sync disabled',
    );
  }, [applyState, persistNow, previewTransport, runtimeEntry, universalTransport.transport]);

  const updateTrackSound = useCallback((trackId, nextTrack, options = {}) => {
    const result = updateBeatTrackSoundState(stateRef.current, trackId, nextTrack);
    if (!result.ok) {
      setError(result.reason);
      setStatus(result.reason);
      return;
    }
    void persist(result.state, 'Track sound saved', options);
  }, [persist]);

  const updateAgentAudio = useCallback((patch, options = {}) => {
    const result = updateBeatAgentAudioState(stateRef.current, patch);
    if (!result.ok) {
      setError(result.reason);
      setStatus(result.reason);
      return;
    }
    void persist(result.state, 'Audio settings saved', options);
  }, [persist]);

  const setTemporalActive = useCallback((active, options = {}) => {
    const result = updateBeatAgentTemporalActiveState(stateRef.current, active);
    if (!result.ok) {
      setError(result.reason);
      setStatus(result.reason);
      return;
    }
    void persist(result.state, 'Audio settings saved', options);
  }, [persist]);

  const updateTrackSynth = useCallback((trackId, patch, options = {}) => {
    const result = updateBeatTrackSynthState(stateRef.current, trackId, patch);
    if (!result.ok) {
      setError(result.reason);
      setStatus(result.reason);
      return;
    }
    void persist(result.state, 'Sound saved', options);
  }, [persist]);

  const updateTransportSettings = useCallback((patch, options = {}) => {
    const result = updateBeatTransportSettingsState(stateRef.current, patch);
    if (!result.ok) {
      setError(result.reason);
      setStatus(result.reason);
      return;
    }
    const nextTransport = result.state.transport ?? {};
    applyBeatClockTransportSettings(previewTransport, nextTransport);
    if (clockSync) {
      applySyncedBeatTransportSettings(nextTransport);
      applyBeatClockTransportSettings(universalTransport.transport, nextTransport);
    }
    if (clockSync && projectId) {
      void saveProjectMusicTransport(projectId, nextTransport).catch(() => {});
    }
    void persist(result.state, 'Transport saved', options);
  }, [
    clockSync,
    persist,
    previewTransport,
    projectId,
    universalTransport.transport,
  ]);

  useEffect(() => {
    if (!agentId) return undefined;
    let cancelled = false;
    fetchMusicAgent(agentId)
      .then((loaded) => {
        if (cancelled) return;
        setAgent(loaded);
        if (loaded?.state) {
          const loadedState = createDefaultBeatAgentState(loaded.state);
          const mergedState = newestBeatState(loadedState, stateRef.current);
          applyState(mergedState);
          if (mergedState.transport) {
            applyBeatClockTransportSettings(previewTransport, mergedState.transport);
            if (mergedState.clockSync) {
              applySyncedBeatTransportSettings(mergedState.transport);
              applyBeatClockTransportSettings(universalTransport.transport, mergedState.transport);
            }
            appliedTransportRevisionRef.current = mergedState.transport.updatedAt ?? JSON.stringify(mergedState.transport);
          }
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          const reason = loadError?.message ?? 'Could not load Beat Agent';
          setError(reason);
          setStatus(reason);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, applyState, previewTransport, universalTransport.transport]);

  useEffect(() => {
    const agentTransport = state.transport;
    if (!agentTransport) return;
    const revision = agentTransport.updatedAt ?? JSON.stringify(agentTransport);
    if (appliedTransportRevisionRef.current === revision) return;
    appliedTransportRevisionRef.current = revision;
    const settings = stripBeatLiveTransportState(agentTransport);
    applyBeatClockTransportSettings(previewTransport, settings);
    if (clockSync) {
      applySyncedBeatTransportSettings(settings);
      applyBeatClockTransportSettings(universalTransport.transport, settings);
    }
  }, [clockSync, previewTransport, state.transport, universalTransport.transport]);

  useEffect(() => () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      const pending = pendingStateRef.current;
      if (pending) void persistToBackendsRef.current?.(pending.state, pending.message);
    }
  }, []);

  const playhead = transportState.currentTick % (state.pattern?.stepCount ?? 16);
  const enableBeatAudio = useCallback(async () => {
    try {
      setError('');
      previewTransport.prepareUserGesture?.();
      kernel.audioEngine.prepareUserGesture?.();
      if (typeof previewTransport.enableAudio === 'function') {
        await previewTransport.enableAudio();
      } else {
        await kernel.audioEngine.resumeIfNeeded?.();
      }
      setAudioContextState(kernel.audioEngine.getContextState?.() ?? 'running');
      setStatus('Audio enabled');
      clearStatusSoon();
    } catch (enableError) {
      const reason = enableError?.message ?? 'Could not enable Beat Agent audio';
      setError(reason);
      setStatus(reason);
    }
  }, [clearStatusSoon, kernel.audioEngine, previewTransport]);

  const prepareBeatAudio = useCallback(() => {
    previewTransport.prepareUserGesture?.();
    kernel.audioEngine.prepareUserGesture?.();
  }, [kernel.audioEngine, previewTransport]);

  const playPlayback = useCallback(async (options) => {
    try {
      setError('');
      previewTransport.prepareUserGesture?.();
      kernel.audioEngine.prepareUserGesture?.();
      await kernel.audioEngine.resumeIfNeeded?.();
      setAudioContextState(kernel.audioEngine.getContextState?.() ?? 'none');
      if (kernel.audioEngine.getContextState?.() !== 'running') {
        throw new Error('Audio is blocked by the browser. Click Enable audio first.');
      }
      await previewTransport.ensureReady();
      const transport = stripBeatLiveTransportState(stateRef.current.transport ?? {});
      applyBeatClockTransportSettings(previewTransport, transport);
      await updateBeatWorkletAgent(previewTransport, runtimeKey, runtimeEntry.latestState ?? stateRef.current, {
        cards: cardsRef.current,
        ...(() => {
          const audioContext = resolveAudioContext();
          return {
            descriptorGraph: audioContext.descriptorGraph,
            audioRouting: audioContext.audioRouting,
          };
        })(),
        isolatedTrackId: runtimeEntry.isolatedTrackId ?? null,
      });
      previewTransport.applyBeatAudioRouting?.(resolveAudioContext());
      const startTick = Number.isFinite(Number(options?.startTick))
        ? Number(options.startTick)
        : (transportState.currentTick ?? 0);
      if (clockSync) {
        applySyncedBeatTransportSettings(transport);
        await playAllSyncedBeatAgents({ startTick });
        return;
      }
      await previewTransport.play({ ...options, startTick });
    } catch (playError) {
      const reason = playError?.message ?? 'Could not start Beat Agent playback';
      setError(reason);
      setStatus(reason);
    }
  }, [
    clockSync,
    kernel.audioEngine,
    previewTransport,
    resolveAudioContext,
    runtimeEntry,
    runtimeKey,
    transportState.currentTick,
  ]);

  const stopPlayback = useCallback(() => {
    if (clockSync) {
      stopSyncedBeatAgent(runtimeKey);
      return;
    }
    previewTransport.stop();
  }, [clockSync, previewTransport, runtimeKey]);

  const toggleTrackIsolate = useCallback((trackId) => {
    const nextId = runtimeEntry.isolatedTrackId === trackId ? null : trackId;
    runtimeEntry.isolatedTrackId = nextId;
    setIsolatedTrackId(nextId);
    syncWorkletAudioRef.current?.(stateRef.current);
  }, [runtimeEntry]);

  return {
    agent,
    setAgent,
    state,
    setState,
    status,
    setStatus,
    saving,
    error,
    setError,
    transport: {
      state: transportState,
      play: playPlayback,
      prepareBeatAudio,
      enableBeatAudio,
      audioContextState,
      stop: stopPlayback,
      setTransportState: setActiveTransportState,
    },
    transportState,
    play: playPlayback,
    prepareBeatAudio,
    enableBeatAudio,
    audioContextState,
    stop: stopPlayback,
    setTransportState: setActiveTransportState,
    clockSync,
    toggleClockSync,
    playhead,
    toggleStep,
    updateTrackSynth,
    updateTrackSound,
    updateAgentAudio,
    setTemporalActive,
    updateTransportSettings,
    persist,
    persistNow,
    isolatedTrackId,
    toggleTrackIsolate,
  };
}
