import { afterEach, describe, expect, it, vi } from 'vitest';
import { MusicTransport } from '../MusicTransport.js';

describe('MusicTransport lookahead scheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits beat steps ahead of the audio clock with scheduled audio times', async () => {
    vi.useFakeTimers();
    let audioTime = 10;
    const transport = new MusicTransport({ bpm: 120 });
    transport.setAudioClock({
      ensureReady: vi.fn(async () => {}),
      getCurrentTime: () => audioTime,
    });
    const steps = [];
    transport.onStep((event) => steps.push(event));

    transport.play();
    await Promise.resolve();

    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      step: 0,
      scheduledAudioTime: 10.04,
    });

    audioTime = 10.08;
    vi.advanceTimersByTime(25);

    expect(steps).toHaveLength(2);
    expect(steps[1].step).toBe(1);
    expect(steps[1].scheduledAudioTime).toBeCloseTo(10.165, 6);

    transport.stop();
  });

  it('wraps scheduled steps across the loop boundary', async () => {
    vi.useFakeTimers();
    let audioTime = 0;
    const transport = new MusicTransport({ bpm: 300 });
    transport.lookaheadSeconds = 1;
    transport.setAudioClock({
      ensureReady: vi.fn(async () => {}),
      getCurrentTime: () => audioTime,
    });
    const steps = [];
    transport.onStep(({ step }) => steps.push(step));

    transport.play();
    await Promise.resolve();

    expect(steps.slice(0, 18)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
      8, 9, 10, 11, 12, 13, 14, 15,
      0, 1,
    ]);

    transport.stop();
  });

  it('delays current tick display until the scheduled beat time', () => {
    vi.useFakeTimers();
    let audioTime = 10;
    const transport = new MusicTransport({ bpm: 120 });
    transport.setAudioClock({
      ensureReady: vi.fn(async () => {}),
      getCurrentTime: () => audioTime,
    });
    transport.state = {
      ...transport.state,
      isPlaying: true,
      currentTick: 0,
      currentBeat: 1,
    };
    transport.startToken = 1;
    transport.stepIndex = 1;
    const states = [];
    const steps = [];
    transport.subscribe((state) => states.push(state.currentTick));
    transport.onStep((event) => steps.push(event.step));

    transport.scheduleStep(10.2);

    expect(steps).toEqual([1]);
    expect(states.at(-1)).toBe(0);

    audioTime = 10.15;
    vi.advanceTimersByTime(150);
    expect(states.at(-1)).toBe(0);

    audioTime = 10.2;
    vi.advanceTimersByTime(50);
    expect(states.at(-1)).toBe(1);

    transport.stop();
  });

  it('skips missed scheduler slots instead of dumping a burst of late steps', () => {
    let audioTime = 1;
    const transport = new MusicTransport({ bpm: 120 });
    transport.setAudioClock({
      ensureReady: vi.fn(async () => {}),
      getCurrentTime: () => audioTime,
    });
    transport.state = {
      ...transport.state,
      isPlaying: true,
    };
    transport.nextStepTime = 0;
    transport.stepIndex = 0;
    const steps = [];
    transport.onStep((event) => steps.push(event.step));

    transport.schedulerTick();

    expect(steps.length).toBeLessThanOrEqual(2);
    expect(steps[0]).toBe(8);
  });

  it('clears the active scheduler when state is set to not playing', async () => {
    vi.useFakeTimers();
    let audioTime = 0;
    const transport = new MusicTransport({ bpm: 120 });
    transport.setAudioClock({
      ensureReady: vi.fn(async () => {}),
      getCurrentTime: () => audioTime,
    });
    const steps = [];
    transport.onStep((event) => steps.push(event));

    transport.play();
    await Promise.resolve();
    transport.setState({ isPlaying: false });
    audioTime = 1;
    vi.advanceTimersByTime(200);

    expect(steps).toHaveLength(1);
  });
});
