import {
  createDefaultTransportState,
  stepDurationSeconds,
  updateTransportState,
} from '../../../../packages/music-core/src/index.js';

export class MusicTransport {
  constructor(initialState = {}) {
    this.state = createDefaultTransportState(initialState);
    this.listeners = new Set();
    this.beatListeners = new Set();
    this.intervalId = null;
    this.displayTimeoutIds = new Set();
    this.stepIndex = 0;
    this.nextStepTime = 0;
    this.lookaheadSeconds = 0.1;
    this.schedulerIntervalMs = 25;
    this.scheduleStartDelaySeconds = 0.04;
    this.audioClock = {
      ensureReady: async () => {},
      getCurrentTime: () => performance.now() / 1000,
    };
    this.startToken = 0;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  onStep(listener) {
    this.beatListeners.add(listener);
    return () => this.beatListeners.delete(listener);
  }

  emit() {
    for (const listener of this.listeners) listener(this.state);
  }

  setAudioClock(clock = {}) {
    this.audioClock = {
      ensureReady: typeof clock.ensureReady === 'function' ? clock.ensureReady : async () => {},
      getCurrentTime: typeof clock.getCurrentTime === 'function'
        ? clock.getCurrentTime
        : () => performance.now() / 1000,
    };
  }

  setState(patch) {
    this.state = updateTransportState(this.state, patch);
    if (this.state.isPlaying) {
      this.restartTimer({ keepStep: true });
    } else if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.startToken += 1;
      this.clearDisplayTimers();
    }
    this.emit();
  }

  play() {
    if (this.state.isPlaying) return;
    this.state = updateTransportState(this.state, { isPlaying: true, isPaused: false });
    this.restartTimer();
    this.emit();
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    this.clearDisplayTimers();
    this.startToken += 1;
    this.stepIndex = 0;
    this.nextStepTime = 0;
    this.state = updateTransportState(this.state, {
      isPlaying: false,
      isPaused: false,
      currentBar: 1,
      currentBeat: 1,
      currentTick: 0,
    });
    this.emit();
  }

  restartTimer({ keepStep = false } = {}) {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    this.clearDisplayTimers();
    if (!this.state.isPlaying) return;
    const token = this.startToken + 1;
    this.startToken = token;
    if (!keepStep) {
      this.stepIndex = 0;
    }
    void this.startScheduler(token);
  }

  async startScheduler(token) {
    try {
      await this.audioClock.ensureReady();
    } catch (error) {
      console.warn('Music transport could not start audio clock.', error);
      if (token === this.startToken) {
        this.state = updateTransportState(this.state, { isPlaying: false, isPaused: false });
        this.emit();
      }
      return;
    }
    if (token !== this.startToken || !this.state.isPlaying) return;
    const now = this.currentAudioTime();
    this.nextStepTime = now + this.scheduleStartDelaySeconds;
    this.schedulerTick();
    this.intervalId = setInterval(() => this.schedulerTick(), this.schedulerIntervalMs);
  }

  currentAudioTime() {
    const value = Number(this.audioClock.getCurrentTime());
    return Number.isFinite(value) ? value : performance.now() / 1000;
  }

  stepDurationSeconds() {
    return stepDurationSeconds({
      bpm: this.state.bpm,
      stepsPerBar: 16,
      timeSignature: this.state.timeSignature,
    });
  }

  schedulerTick() {
    if (!this.state.isPlaying) return;
    const now = this.currentAudioTime();
    const horizon = now + this.lookaheadSeconds;
    const stepDuration = this.stepDurationSeconds();
    if (this.nextStepTime < now - stepDuration) {
      const missedSteps = Math.floor((now - this.nextStepTime) / stepDuration);
      this.stepIndex = (this.stepIndex + missedSteps) % 16;
      this.nextStepTime += missedSteps * stepDuration;
    }
    while (this.nextStepTime <= horizon) {
      this.scheduleStep(this.nextStepTime);
      this.nextStepTime += stepDuration;
    }
  }

  scheduleStep(scheduledAudioTime = this.currentAudioTime()) {
    const step = this.stepIndex % 16;
    const beat = Math.floor(step / 4) + 1;
    const stepTransport = {
      ...this.state,
      currentBeat: beat,
      currentTick: step,
    };
    for (const listener of this.beatListeners) {
      listener({
        step,
        transport: stepTransport,
        scheduledAt: performance.now(),
        scheduledAudioTime,
      });
    }
    this.stepIndex = (this.stepIndex + 1) % 16;
    this.scheduleDisplayStep(stepTransport, scheduledAudioTime);
  }

  scheduleDisplayStep(stepTransport, scheduledAudioTime) {
    const delayMs = Math.max(0, (scheduledAudioTime - this.currentAudioTime()) * 1000);
    const token = this.startToken;
    const showStep = () => {
      if (token !== this.startToken || !this.state.isPlaying) return;
      this.state = stepTransport;
      this.emit();
    };
    if (delayMs <= 1) {
      showStep();
      return;
    }
    const timeoutId = setTimeout(() => {
      this.displayTimeoutIds.delete(timeoutId);
      showStep();
    }, delayMs);
    this.displayTimeoutIds.add(timeoutId);
  }

  clearDisplayTimers() {
    for (const timeoutId of this.displayTimeoutIds) clearTimeout(timeoutId);
    this.displayTimeoutIds.clear();
  }

  tick() {
    const scheduledAudioTime = this.currentAudioTime();
    const step = this.stepIndex % 16;
    const beat = Math.floor(step / 4) + 1;
    this.state = {
      ...this.state,
      currentBeat: beat,
      currentTick: step,
    };
    for (const listener of this.beatListeners) {
      listener({
        step,
        transport: this.state,
        scheduledAt: performance.now(),
        scheduledAudioTime,
      });
    }
    this.stepIndex = (this.stepIndex + 1) % 16;
    this.emit();
  }
}
