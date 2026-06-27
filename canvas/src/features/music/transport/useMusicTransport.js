import { useEffect, useMemo, useState } from 'react';
import { MusicTransport } from './MusicTransport.js';

export function useMusicTransport(initialState = {}) {
  const transport = useMemo(() => new MusicTransport(initialState), []);
  const [state, setState] = useState(transport.state);

  useEffect(() => transport.subscribe(setState), [transport]);
  useEffect(() => () => transport.stop(), [transport]);

  return {
    transport,
    state,
    play: () => transport.play(),
    stop: () => transport.stop(),
    setTransportState: (patch) => transport.setState(patch),
  };
}
