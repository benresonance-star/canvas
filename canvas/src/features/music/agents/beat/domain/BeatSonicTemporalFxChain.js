import {
  applyWorkletParams,
  mapSonicTemporalToWorkletState,
} from './mapSonicTemporalToWorkletParams.js';
import { resolveBeatMixSettings } from './resolveBeatAudioRouting.js';

const TEMPORAL_WORKLET_URL = '/audio-worklets/temporal-delay-processor.js';

export class BeatSonicTemporalFxChain {
  constructor(context) {
    this.context = context;
    this.dryGain = null;
    this.wetGain = null;
    this.returnLowCut = null;
    this.returnHighCut = null;
    this.limiter = null;
    this.fxNode = null;
    this.fxReady = false;
    this.fxFailed = false;
    this.lastSignature = '';
    this.mixSettings = resolveBeatMixSettings();
  }

  async connect(workletNode, destination) {
    if (!this.context || !workletNode || !destination) return;
    this.disconnect();
    this.dryGain = this.context.createGain();
    this.wetGain = this.context.createGain();
    this.returnLowCut = this.context.createBiquadFilter();
    this.returnLowCut.type = 'highpass';
    this.returnHighCut = this.context.createBiquadFilter();
    this.returnHighCut.type = 'lowpass';
    this.limiter = this.context.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.06;

    const dryOutput = workletNode;
    dryOutput.connect(this.dryGain, 0, 0);
    this.dryGain.connect(destination);

    await this.ensureFxNode();
    if (this.fxNode) {
      dryOutput.connect(this.fxNode, 1, 0);
      this.fxNode.connect(this.returnLowCut);
      this.returnLowCut.connect(this.returnHighCut);
      this.returnHighCut.connect(this.limiter);
      this.limiter.connect(this.wetGain);
      this.wetGain.connect(destination);
    }

    this.applyMixSettings(this.mixSettings);
  }

  async ensureFxNode() {
    if (this.fxNode || this.fxFailed || !this.context?.audioWorklet) return;
    try {
      await this.context.audioWorklet.addModule(TEMPORAL_WORKLET_URL);
      this.fxNode = new AudioWorkletNode(this.context, 'temporal-delay-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      this.fxReady = true;
    } catch (error) {
      console.warn('Beat sonic temporal FX unavailable.', error);
      this.fxFailed = true;
    }
  }

  applyMixSettings(mixSettings = {}) {
    this.mixSettings = resolveBeatMixSettings(mixSettings);
    if (!this.context) return;
    const headroom = 10 ** (this.mixSettings.preFxHeadroomDb / 20);
    const now = this.context.currentTime;
    if (this.dryGain) {
      this.dryGain.gain.cancelScheduledValues(now);
      this.dryGain.gain.setTargetAtTime(headroom, now, 0.02);
    }
    if (this.returnLowCut) {
      this.returnLowCut.frequency.setTargetAtTime(this.mixSettings.returnLowCutHz, now, 0.02);
    }
    if (this.returnHighCut) {
      this.returnHighCut.frequency.setTargetAtTime(this.mixSettings.returnHighCutHz, now, 0.02);
    }
  }

  applyRouting({ bypassTemporal, effectiveTemporal, routing, mixSettings } = {}) {
    if (mixSettings) this.applyMixSettings(mixSettings);
    const signature = JSON.stringify({ bypassTemporal, effectiveTemporal, routing, mixSettings: this.mixSettings });
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    const now = this.context?.currentTime ?? 0;
    const maxWet = this.mixSettings.maxWet;

    if (bypassTemporal || !effectiveTemporal || !this.fxNode) {
      if (this.wetGain) {
        this.wetGain.gain.cancelScheduledValues(now);
        this.wetGain.gain.setTargetAtTime(0, now, 0.01);
      }
      if (this.fxNode) {
        this.fxNode.port.postMessage({ topology: 'digital', freeze: false });
      }
      return;
    }

    const params = mapSonicTemporalToWorkletState(effectiveTemporal, routing);
    applyWorkletParams(this.fxNode, {
      delayMs: params.delayMs,
      feedback: params.feedback,
      wet: 0.85,
      diffusion: params.diffusion,
      modRateHz: params.modRateHz,
      modDepth: params.modDepth,
      drive: params.drive,
      damping: params.damping,
      width: params.width,
    }, this.context);
    this.fxNode.port.postMessage({
      topology: params.topology,
      freeze: params.freeze,
      pitchRatio: params.pitchRatio,
    });

    if (this.wetGain) {
      this.wetGain.gain.cancelScheduledValues(now);
      this.wetGain.gain.setTargetAtTime(Math.min(maxWet, params.wet), now, 0.02);
    }
  }

  postMixSettings(roleSendLevels) {
    return {
      roleSendLevels: {
        ...this.mixSettings.roleSendLevels,
        ...roleSendLevels,
      },
    };
  }

  disconnect() {
    for (const node of [
      this.dryGain,
      this.wetGain,
      this.returnLowCut,
      this.returnHighCut,
      this.limiter,
      this.fxNode,
    ]) {
      try {
        node?.disconnect?.();
      } catch {
        /* ignore */
      }
    }
    this.dryGain = null;
    this.wetGain = null;
    this.returnLowCut = null;
    this.returnHighCut = null;
    this.limiter = null;
    this.fxNode = null;
    this.fxReady = false;
    this.lastSignature = '';
  }

  clearFxBuffer() {
    this.fxNode?.port?.postMessage?.({ topology: 'digital', freeze: false, clear: true });
  }
}
