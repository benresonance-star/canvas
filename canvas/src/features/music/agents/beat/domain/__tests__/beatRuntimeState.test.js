import { describe, expect, it } from 'vitest';
import { createDefaultBeatAgentState } from '../beatAgentState.js';
import {
  beatAgentTemporalActivePatch,
  updateBeatAgentGlitchState,
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

describe('updateBeatAgentGlitchState', () => {
  it('normalizes and timestamps glitch patches', () => {
    const state = createDefaultBeatAgentState({
      glitch: { enabled: false, seed: 10 },
    });
    const result = updateBeatAgentGlitchState(state, {
      enabled: true,
      amount: 2,
      phraseLengthLoops: 99,
      sonic: { enabled: true, temporalSend: 0.5, distortionAmount: 0.4 },
    });

    expect(result.ok).toBe(true);
    expect(result.state.glitch.enabled).toBe(true);
    expect(result.state.glitch.amount).toBe(1);
    expect(result.state.glitch.phraseLengthLoops).toBe(8);
    expect(result.state.glitch.sonic.enabled).toBe(true);
    expect(result.state.glitch.sonic.temporalSend).toBe(0.5);
    expect(result.state.glitch.sonic.distortionAmount).toBe(0.4);
    expect(result.state.glitch.updatedAt).toEqual(expect.any(String));
  });
});
