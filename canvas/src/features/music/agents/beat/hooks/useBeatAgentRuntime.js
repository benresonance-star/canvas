import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createDefaultBeatAgentState,
  summarizeBeatBlackboard,
  validateBeatAgentState,
} from '../domain/beatAgentState.js';
import {
  resolveBeatAgentId,
  toggleBeatAgentStepState,
  updateBeatTransportSettingsState,
  updateBeatTrackSynthState,
} from '../domain/beatRuntimeState.js';
import {
  applyBeatClockTransportSettings,
  bindBeatRuntimeTransport,
  startBeatWorkletSession,
  stripBeatLiveTransportState,
  updateBeatWorkletAgent,
} from '../domain/beatClockSync.js';
import {
  ensureBeatPreviewTransport,
  resolveBeatAudioTransport,
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
  overwriteTextFileAtPath,
} from '../../../../../lib/folderWrite.js';

const beatRuntimeEntries = new Map();

function createRuntimeEntry(key) {
  const entry = {
    key,
    refs: 0,
    workletRefs: 0,
    registeredAudioTransport: null,
    latestState: null,
    latestTemporalState: null,
    cleanupTimer: null,
    previewTransport: null,
    engine: null,
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

function defaultBeatStateFromCard(card) {
  return card?.musicState
    ? createDefaultBeatAgentState(card.musicState)
    : createDefaultBeatAgentState({ name: card?.name });
}

function updateCardFromRuntime(onUpdateCard, cardId, updates) {
  if (!onUpdateCard || !cardId) return;
  if (onUpdateCard.length >= 2) {
    onUpdateCard(cardId, updates);
  } else {
    onUpdateCard(updates);
  }
}

export function useBeatAgentRuntime({
  card,
  projectId = null,
  folderHandle = null,
  onUpdateCard = null,
  debounceMs = 0,
  temporalState = null,
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
  const stateRef = useRef(state);
  const temporalStateRef = useRef(temporalState);
  const agentRef = useRef(agent);
  const saveTimerRef = useRef(null);
  const pendingStateRef = useRef(null);
  const persistToBackendsRef = useRef(null);
  const appliedTransportRevisionRef = useRef(null);

  stateRef.current = state;
  temporalStateRef.current = temporalState;
  agentRef.current = agent;

  runtimeEntry.latestState = newestBeatState(runtimeEntry.latestState, state);
  runtimeEntry.latestTemporalState = temporalState;
  const kernel = useMusicKernel();
  const universalTransport = useUniversalMusicTransport();
  const previewTransport = ensureBeatPreviewTransport(runtimeEntry, kernel.audioEngine);
  const clockSync = Boolean(state.clockSync);
  const activeAudioTransport = resolveBeatAudioTransport(runtimeEntry, {
    clockSync,
    sharedTransport: universalTransport.transport,
    audioEngine: kernel.audioEngine,
  });
  const [previewTransportState, setPreviewTransportState] = useState(
    () => previewTransport.transportState,
  );

  useEffect(
    () => previewTransport.subscribeTransportState(setPreviewTransportState),
    [previewTransport],
  );

  const transportState = clockSync ? universalTransport.state : previewTransportState;
  const setActiveTransportState = useCallback((patch) => {
    activeAudioTransport.setTransportSettings(patch);
  }, [activeAudioTransport]);

  useEffect(() => {
    const canonicalState = newestBeatState(runtimeEntry.latestState, state);
    if (canonicalState !== state) {
      setState(canonicalState);
    }
  }, [runtimeEntry, state]);

  useEffect(() => {
    runtimeEntry.refs += 1;
    return () => releaseRuntimeEntry(runtimeEntry);
  }, [runtimeEntry]);

  useEffect(() => {
    void runtimeEntry.engine.ensureContext().then(() => {
      runtimeEntry.engine.applyTemporalState();
    });
  }, [runtimeEntry, temporalState]);

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
      stateRef.current,
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
  ]);

  useEffect(() => {
    if (!runtimeKey) return;
    void updateBeatWorkletAgent(activeAudioTransport, runtimeKey, state);
  }, [activeAudioTransport, clockSync, runtimeKey, state]);

  const clearStatusSoon = useCallback(() => {
    window.setTimeout(() => setStatus(''), 2500);
  }, []);

  const persistToBackends = useCallback(async (nextState, message = 'Saved') => {
    const validation = validateBeatAgentState(nextState);
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
        name: nextState.name,
        status: nextState.status,
        state: nextState,
      });
      setAgent(saved);
      if (projectId) {
        await saveMusicBlackboard(projectId, {
          [saved.id]: summarizeBeatBlackboard(nextState),
        });
      }
      if (folderHandle && await ensureWritePermission(folderHandle)) {
        const basePath = saved.filePath ?? `music/beat-agent-${saved.id}`;
        await overwriteTextFileAtPath(
          folderHandle,
          `${basePath}/beat.agent.json`,
          JSON.stringify(nextState, null, 2),
        );
        await overwriteTextFileAtPath(
          folderHandle,
          `${basePath}/current.pattern.json`,
          JSON.stringify(nextState.pattern, null, 2),
        );
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
    const canonicalState = newestBeatState(runtimeEntry.latestState, nextState);
    runtimeEntry.latestState = canonicalState;
    setState(canonicalState);
    updateCardFromRuntime(onUpdateCard, cardId, {
      musicState: canonicalState,
      name: canonicalState.name,
    });
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
      if (pending) void persistToBackends(pending.state, pending.message);
    }, debounceMs);
  }, [applyState, debounceMs, persistToBackends]);

  const persist = useCallback((nextState, message = 'Saved', options = {}) => {
    if (options.debounce && debounceMs > 0) {
      schedulePersist(nextState, message);
      return Promise.resolve(true);
    }
    return persistNow(nextState, message);
  }, [debounceMs, persistNow, schedulePersist]);

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
        await universalTransport.transport.ensureReady();
        applyBeatClockTransportSettings(
          universalTransport.transport,
          stripBeatLiveTransportState(nextState.transport ?? {}),
        );
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
    }
    await persistNow(
      runtimeEntry.latestState,
      enabled ? 'Clock sync enabled' : 'Clock sync disabled',
    );
  }, [applyState, persistNow, runtimeEntry, universalTransport.transport]);

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
    applyBeatClockTransportSettings(activeAudioTransport, nextTransport);
    if (clockSync && projectId) {
      void saveProjectMusicTransport(projectId, nextTransport).catch(() => {});
    }
    void persist(result.state, 'Transport saved', options);
  }, [
    activeAudioTransport,
    clockSync,
    persist,
    projectId,
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
          const mergedState = newestBeatState(stateRef.current, loadedState);
          applyState(mergedState);
          if (mergedState.transport) {
            const loadTransport = resolveBeatAudioTransport(runtimeEntry, {
              clockSync: mergedState.clockSync,
              sharedTransport: universalTransport.transport,
              audioEngine: kernel.audioEngine,
            });
            applyBeatClockTransportSettings(loadTransport, mergedState.transport);
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
  }, [agentId, applyState, kernel.audioEngine, runtimeEntry, universalTransport.transport]);

  useEffect(() => {
    const agentTransport = state.transport;
    if (!agentTransport) return;
    const revision = agentTransport.updatedAt ?? JSON.stringify(agentTransport);
    if (appliedTransportRevisionRef.current === revision) return;
    appliedTransportRevisionRef.current = revision;
    applyBeatClockTransportSettings(
      activeAudioTransport,
      stripBeatLiveTransportState(agentTransport),
    );
  }, [activeAudioTransport, state.transport]);

  useEffect(() => () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      const pending = pendingStateRef.current;
      if (pending) void persistToBackendsRef.current?.(pending.state, pending.message);
    }
  }, []);

  const playhead = transportState.currentTick % (state.pattern?.stepCount ?? 16);
  const playPlayback = useCallback(async (options) => {
    try {
      setError('');
      const audioTransport = resolveBeatAudioTransport(runtimeEntry, {
        clockSync: stateRef.current.clockSync,
        sharedTransport: universalTransport.transport,
        audioEngine: kernel.audioEngine,
      });
      await audioTransport.ensureReady();
      applyBeatClockTransportSettings(
        audioTransport,
        stripBeatLiveTransportState(stateRef.current.transport ?? {}),
      );
      if (runtimeKey) {
        await updateBeatWorkletAgent(audioTransport, runtimeKey, stateRef.current);
      }
      await audioTransport.play(options);
    } catch (playError) {
      const reason = playError?.message ?? 'Could not start Beat Agent playback';
      setError(reason);
      setStatus(reason);
    }
  }, [kernel.audioEngine, runtimeEntry, runtimeKey, universalTransport.transport]);

  const stopPlayback = useCallback(() => {
    if (clockSync) {
      universalTransport.transport.stop();
      return;
    }
    previewTransport.stop();
  }, [clockSync, previewTransport, universalTransport.transport]);

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
      stop: stopPlayback,
      setTransportState: setActiveTransportState,
    },
    transportState,
    play: playPlayback,
    stop: stopPlayback,
    setTransportState: setActiveTransportState,
    clockSync,
    toggleClockSync,
    playhead,
    toggleStep,
    updateTrackSynth,
    updateTransportSettings,
    persist,
    persistNow,
  };
}
