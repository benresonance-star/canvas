const FDN_WORKLET_URL = '/audio-worklets/fdn-reverb-processor.js';
const WET_SEND_MAKEUP = 1.15;

export class BeatAcousticSpaceFxChain {
  constructor(context) {
    this.context = context;
    this.dryGain = null;
    this.wetGain = null;
    this.fdnNode = null;
    this.fdnReady = false;
    this.fdnFailed = false;
    this.lastSignature = '';
  }

  async connect(source, destination) {
    if (!this.context || !source || !destination) return;
    this.disconnect();
    this.dryGain = this.context.createGain();
    this.dryGain.gain.value = 1;
    this.wetGain = this.context.createGain();
    this.wetGain.gain.value = 0;

    source.connect(this.dryGain);
    this.dryGain.connect(destination);

    await this.ensureFdnNode();
    if (this.fdnNode) {
      source.connect(this.fdnNode);
      this.fdnNode.connect(this.wetGain);
      this.wetGain.connect(destination);
      this.fdnNode.port.postMessage({ sendMode: true });
    }
  }

  async ensureFdnNode() {
    if (this.fdnNode || this.fdnFailed || !this.context?.audioWorklet) return;
    try {
      await this.context.audioWorklet.addModule(FDN_WORKLET_URL);
      this.fdnNode = new AudioWorkletNode(this.context, 'fdn-reverb-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      this.fdnReady = true;
    } catch (error) {
      console.warn('Beat acoustic space FDN unavailable.', error);
      this.fdnFailed = true;
    }
  }

  applyRouting({ bypassSpace, fdnParams } = {}) {
    const signature = JSON.stringify({ bypassSpace, fdnParams });
    const now = this.context?.currentTime ?? 0;

    if (this.dryGain) {
      this.dryGain.gain.cancelScheduledValues(now);
      this.dryGain.gain.setTargetAtTime(1, now, 0.01);
    }

    if (bypassSpace || !fdnParams?.enabled || !this.fdnNode) {
      if (this.wetGain) {
        this.wetGain.gain.cancelScheduledValues(now);
        this.wetGain.gain.setTargetAtTime(0, now, 0.01);
      }
      if (this.fdnNode) {
        this.lastSignature = signature;
      }
      return;
    }

    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    const params = this.fdnNode.parameters;
    params.get('size')?.setTargetAtTime?.(fdnParams.size, now, 0.03);
    params.get('feedback')?.setTargetAtTime?.(fdnParams.feedback, now, 0.03);
    params.get('wet')?.setTargetAtTime?.(1, now, 0.03);
    params.get('damping')?.setTargetAtTime?.(fdnParams.damping, now, 0.03);
    params.get('width')?.setTargetAtTime?.(fdnParams.width, now, 0.03);
    params.get('sendGain')?.setTargetAtTime?.(fdnParams.sendGain ?? 2.8, now, 0.03);
    params.get('delayScale')?.setTargetAtTime?.(fdnParams.delayScale ?? 1, now, 0.03);
    params.get('inputDiffusion')?.setTargetAtTime?.(fdnParams.inputDiffusion ?? 0.5, now, 0.03);
    params.get('predelayMs')?.setTargetAtTime?.(fdnParams.predelayMs ?? 12, now, 0.03);
    params.get('modDepth')?.setTargetAtTime?.(fdnParams.modDepth ?? 0.05, now, 0.03);

    if (this.wetGain) {
      this.wetGain.gain.cancelScheduledValues(now);
      this.wetGain.gain.setTargetAtTime(fdnParams.wet * WET_SEND_MAKEUP, now, 0.03);
    }
  }

  clearFxBuffer() {
    this.fdnNode?.port?.postMessage?.({ clear: true });
  }

  disconnect() {
    for (const node of [this.dryGain, this.wetGain, this.fdnNode]) {
      try {
        node?.disconnect?.();
      } catch {
        /* ignore */
      }
    }
    this.dryGain = null;
    this.wetGain = null;
    this.fdnNode = null;
    this.fdnReady = false;
    this.lastSignature = '';
  }
}
