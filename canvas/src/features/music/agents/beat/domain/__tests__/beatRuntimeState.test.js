import { describe, expect, it } from 'vitest';
import { createDefaultBeatAgentState } from '../beatAgentState.js';
import {
  beatAgentTemporalActivePatch,
  updateBeatAgentTemporalActiveState,
} from '../beatRuntimeState.js';

describe('beatAgentTemporalActivePatch', () => {
  it('enables sonic temporal and clears bypass in one patch', () => {
    const state = createDefaultBeatAgentState({
      sonicTemporal: { enabled: false },
      audioRouting: { sonicTemporalBypass: true },
    });
    const patch = beatAgentTemporalActivePatch(state, true);
    expect(patch.sonicTemporal.enabled).toBe(true);
    expect(patch.audioRouting.sonicTemporalBypass).toBe(false);
  });

  it('disables sonic temporal and sets bypass in one patch', () => {
    const state = createDefaultBeatAgentState({
      sonicTemporal: { enabled: true },
      audioRouting: { sonicTemporalBypass: false },
    });
    const patch = beatAgentTemporalActivePatch(state, false);
    expect(patch.sonicTemporal.enabled).toBe(false);
    expect(patch.audioRouting.sonicTemporalBypass).toBe(true);
  });
});

describe('updateBeatAgentTemporalActiveState', () => {
  it('applies both sonicTemporal and audioRouting atomically', () => {
    const state = createDefaultBeatAgentState({
      sonicTemporal: { enabled: false },
      audioRouting: { sonicTemporalBypass: true },
    });
    const result = updateBeatAgentTemporalActiveState(state, true);
    expect(result.ok).toBe(true);
    expect(result.state.sonicTemporal.enabled).toBe(true);
    expect(result.state.audioRouting.sonicTemporalBypass).toBe(false);
  });
});
