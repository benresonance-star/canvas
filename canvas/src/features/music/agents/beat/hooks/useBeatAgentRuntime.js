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
  startBeatClockSync,
  stopLocalTransportForClockSync,
  stripBeatLiveTransportState,
  updateBeatClockSync,
} from '../domain/beatClockSync.js';
import { BeatEngine } from '../engine/BeatEngine.js';
import { MusicTransport } from '../../../transport/MusicTransport.js';
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

function createRuntimeEntry(key, initialTransport = {}) {
  const entry = {
    key,
    refs: 0,
    syncedRefs: 0,
    registeredAudioTransport: null,
    latestState: null,
    latestTemporalState: null,
    cleanupTimer: null,
    localTransport: new MusicTransport(initialTransport),
    activeTransport: null,
    unsubscribeSteps: null,
    engine: null,
  };
  entry.engine = new BeatEngine({
    getState: () => entry.latestState,
    getTemporalState: () => entry.latestTemporalState,
  });
  return entry;
}

function getRuntimeEntry(key, initialTransport = {}) {
  const runtimeKey = key || 'beat-runtime-anonymous';
  let entry = beatRuntimeEntries.get(runtimeKey);
  if (!entry) {
    entry = createRuntimeEntry(runtimeKey, initialTransport);
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
    entry.localTransport.stop();
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
  const initialCardState = useMemo(
    () => defaultBeatStateFromCard(card),
    [card?.id, card?.musicState, card?.name],
  );
  const runtimeEntryRef = useRef(null);
  if (!runtimeEntryRef.current || runtimeEntryRef.current.key !== (runtimeKey || 'beat-runtime-anonymous')) {
    runtimeEntryRef.current = getRuntimeEntry(runtimeKey, initialCardState.transport ?? {});
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
  const [localTransportState, setLocalTransportState] = useState(runtimeEntry.localTransport.state);
  const universalTransport = useUniversalMusicTransport();
  const engine = runtimeEntry.engine;
  const clockSync = Boolean(state.clockSync);
  const localMusicTransport = runtimeEntry.localTransport;
  const localTransport = useMemo(() => ({
    transport: localMusicTransport,
    state: localTransportState,
    play: () => localMusicTransport.play(),
    stop: () => localMusicTransport.stop(),
    setTransportState: (patch) => localMusicTransport.setState(patch),
  }), [localMusicTransport, localTransportState]);
  const transport = clockSync ? universalTransport : localTransport;

  useEffect(() => {
    const canonicalState = newestBeatState(runtimeEntry.latestState, state);
    if (canonicalState !== state) {
      setState(canonicalState);
    }
  }, [runtimeEntry, state]);

  useEffect(() => {
    const audioClock = {
      ensureReady: () => engine.ensureContext(),
      getCurrentTime: () => engine.currentTime(),
    };
    localMusicTransport.setAudioClock(audioClock);
  }, [engine, localMusicTransport]);

  useEffect(() => {
    runtimeEntry.refs += 1;
    return () => releaseRuntimeEntry(runtimeEntry);
  }, [runtimeEntry]);

  useEffect(() => localMusicTransport.subscribe(setLocalTransportState), [localMusicTransport]);

  useEffect(() => {
    bindBeatRuntimeTransport(runtimeEntry, transport.transport, { clockSync });
  }, [clockSync, runtimeEntry, transport.transport]);

  useEffect(() => {
    if (!clockSync || !runtimeKey) return undefined;
    return startBeatClockSync(
      runtimeEntry,
      universalTransport.transport,
      runtimeKey,
      stateRef.current,
    );
  }, [
    clockSync,
    runtimeEntry,
    runtimeKey,
    universalTransport.registerBeatAgent,
    universalTransport.transport,
  ]);

  useEffect(() => {
    if (!clockSync || !runtimeKey) return;
    updateBeatClockSync(universalTransport.transport, runtimeKey, state);
  }, [clockSync, runtimeKey, state, universalTransport.transport]);

  const cardId = card?.id;
  const agentId = resolveBeatAgentId(card);

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

  const toggleClockSync = useCallback((options = {}) => {
    const enabled = !stateRef.current.clockSync;
    const nextState = {
      ...stateRef.current,
      clockSync: enabled,
      updatedAt: new Date().toISOString(),
    };
    void persist(
      nextState,
      enabled ? 'Clock sync enabled' : 'Clock sync disabled',
      options,
    );
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
    localMusicTransport.setState(nextTransport);
    if (clockSync) {
      applyBeatClockTransportSettings(universalTransport.transport, nextTransport);
    }
    if (projectId) {
      void saveProjectMusicTransport(projectId, nextTransport).catch(() => {});
    }
    void persist(result.state, 'Transport saved', options);
  }, [
    clockSync,
    localMusicTransport,
    persist,
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
          applyState(loadedState);
          if (loadedState.transport) {
            localMusicTransport.setState(stripBeatLiveTransportState(loadedState.transport));
            if (loadedState.clockSync) {
              applyBeatClockTransportSettings(universalTransport.transport, loadedState.transport);
            }
            appliedTransportRevisionRef.current = loadedState.transport.updatedAt ?? JSON.stringify(loadedState.transport);
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
  }, [agentId, applyState, localMusicTransport, universalTransport.transport]);

  useEffect(() => {
    const transportState = state.transport;
    if (!transportState) return;
    const revision = transportState.updatedAt ?? JSON.stringify(transportState);
    if (appliedTransportRevisionRef.current === revision) return;
    appliedTransportRevisionRef.current = revision;
    const transportSettings = stripBeatLiveTransportState(transportState);
    localMusicTransport.setState(transportSettings);
    if (clockSync) {
      applyBeatClockTransportSettings(universalTransport.transport, transportSettings);
    }
  }, [clockSync, localMusicTransport, state.transport, universalTransport.transport]);

  useEffect(() => {
    if (clockSync) stopLocalTransportForClockSync(localMusicTransport);
  }, [clockSync, localMusicTransport]);

  useEffect(() => () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      const pending = pendingStateRef.current;
      if (pending) void persistToBackendsRef.current?.(pending.state, pending.message);
    }
  }, []);

  const playhead = transport.state.currentTick % (state.pattern?.stepCount ?? 16);
  const playPlayback = useCallback(async (options) => {
    try {
      setError('');
      if (clockSync && runtimeKey) {
        updateBeatClockSync(universalTransport.transport, runtimeKey, stateRef.current);
      }
      await transport.play(options);
    } catch (playError) {
      const reason = playError?.message ?? 'Could not start Beat Agent playback';
      setError(reason);
      setStatus(reason);
    }
  }, [clockSync, runtimeKey, transport, universalTransport.transport]);

  const stopPlayback = useCallback(() => {
    transport.stop();
    engine.stop();
  }, [engine, transport]);

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
      ...transport,
      play: playPlayback,
      stop: stopPlayback,
    },
    transportState: transport.state,
    play: playPlayback,
    stop: stopPlayback,
    setTransportState: transport.setTransportState,
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
