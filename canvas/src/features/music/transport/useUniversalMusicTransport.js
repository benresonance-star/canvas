import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMusicKernel } from '../kernel/MusicKernelProvider.jsx';

export function useUniversalMusicTransport() {
  const kernel = useMusicKernel();
  const transport = kernel.audioTransport;
  const [state, setState] = useState(transport.transportState);
  const [position, setPosition] = useState(transport.getPosition());

  useEffect(() => transport.subscribeTransportState(setState), [transport]);
  useEffect(() => transport.subscribePosition(setPosition), [transport]);

  const play = useCallback((options) => transport.play(options), [transport]);
  const stop = useCallback(() => transport.stop(), [transport]);
  const setTransportState = useCallback((patch) => transport.setTransportSettings(patch), [transport]);
  const registerBeatAgent = useCallback((agent) => transport.registerBeatAgent(agent), [transport]);
  const updateBeatAgent = useCallback((id, patch) => transport.updateBeatAgent(id, patch), [transport]);
  const unregisterBeatAgent = useCallback((id) => transport.unregisterBeatAgent(id), [transport]);

  return useMemo(() => ({
    transport,
    state,
    position,
    play,
    stop,
    setTransportState,
    registerBeatAgent,
    updateBeatAgent,
    unregisterBeatAgent,
  }), [
    position,
    play,
    registerBeatAgent,
    setTransportState,
    state,
    stop,
    transport,
    unregisterBeatAgent,
    updateBeatAgent,
  ]);
}
