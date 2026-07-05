import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  attemptFragmentsBootUpdate,
  attemptFragmentsModelLoad,
  configureFragmentsManagerForBimViewport,
  ensureFragmentsUpdated,
  hasViewportLayoutSize,
  isRetryableFragmentsBootError,
  isFragmentsModelRegistered,
  loadFragmentsModelWithRetries,
  resolveBimViewportRuntimeModelId,
  syncFragmentsForViewportBoot,
} from '../bimViewportBoot.js';

describe('bim viewport boot helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('treats any non-trivial layout size as valid', () => {
    expect(hasViewportLayoutSize(2, 2)).toBe(true);
    expect(hasViewportLayoutSize(1, 1)).toBe(false);
    expect(hasViewportLayoutSize(800, 600)).toBe(true);
  });

  it('detects fragments model registration in the manager list', () => {
    const fragments = {
      models: {
        list: new Map([['model-a', {}]]),
      },
    };
    expect(isFragmentsModelRegistered(fragments, 'model-a')).toBe(true);
    expect(isFragmentsModelRegistered(fragments, 'model-b')).toBe(false);
  });

  it('keeps the prepared fragments model id as the runtime id when a cached blob provides one', () => {
    const preparedModel = {
      metadata: {
        fingerprint: 'bim-89fa3c1ccea6bc1b276653f5255fb614a1da50ee7cfd92e982927095b939dd37-unknown-ifc-schema-thatopen-fragments-v0-3',
        fragmentsModelId: 'canvas-bim-legacy-long-id-that-should-not-win',
      },
    };

    expect(resolveBimViewportRuntimeModelId(preparedModel)).toBe('canvas-bim-legacy-long-id-that-should-not-win');
  });

  it('derives a short runtime model id when no prepared fragments model id exists', () => {
    const preparedModel = {
      metadata: {
        fingerprint: 'bim-89fa3c1ccea6bc1b276653f5255fb614a1da50ee7cfd92e982927095b939dd37-unknown-ifc-schema-thatopen-fragments-v0-3',
      },
    };

    expect(resolveBimViewportRuntimeModelId(preparedModel)).toBe('canvas-bim-bim-89fa3c1ccea6bc1b276653f5255f');
  });

  it('configures fragments managers for deterministic BIM viewport boot', () => {
    const fragments = {
      settings: {
        graphicsQuality: 0,
        autoCoordinate: true,
      },
    };

    expect(configureFragmentsManagerForBimViewport(fragments)).toBe(fragments);
    expect(fragments.settings.graphicsQuality).toBe(1);
    expect(fragments.settings.autoCoordinate).toBe(false);
  });

  it('classifies worker model-not-found errors as retryable boot errors', () => {
    expect(isRetryableFragmentsBootError(new Error('Fragments: Model not found: canvas-bim-model'))).toBe(true);
    expect(isRetryableFragmentsBootError(new Error('Fragments worker did not register the model during load.'))).toBe(true);
    expect(isRetryableFragmentsBootError(new Error('Different worker failure'))).toBe(false);
  });

  it('retries fragments update until it succeeds', async () => {
    const updateFragments = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const syncedPromise = ensureFragmentsUpdated(updateFragments, {
      disposed: () => false,
      maxWaitMs: 1000,
    });

    await vi.runAllTimersAsync();
    const synced = await syncedPromise;

    expect(synced).toBe(true);
    expect(updateFragments).toHaveBeenCalledTimes(3);
  });

  it('syncFragmentsForViewportBoot returns immediately when the first update succeeds', async () => {
    const updateFragments = vi.fn().mockResolvedValue(true);
    await expect(syncFragmentsForViewportBoot(updateFragments)).resolves.toBe(true);
    expect(updateFragments).toHaveBeenCalledTimes(1);
  });

  it('times out a stalled fragments boot update attempt', async () => {
    const updateFragments = vi.fn(() => new Promise(() => {}));

    const syncedPromise = attemptFragmentsBootUpdate(updateFragments, {}, 50);

    await vi.advanceTimersByTimeAsync(50);
    await expect(syncedPromise).resolves.toBe(false);
    expect(updateFragments).toHaveBeenCalledTimes(1);
  });

  it('keeps retrying when the first boot update stalls', async () => {
    const updateFragments = vi.fn()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce(true);

    const syncedPromise = syncFragmentsForViewportBoot(updateFragments, {
      maxWaitMs: 1000,
      attemptTimeoutMs: 50,
    });

    await vi.runAllTimersAsync();
    const synced = await syncedPromise;

    expect(synced).toBe(true);
    expect(updateFragments).toHaveBeenCalledTimes(2);
  });

  it('times out a stalled fragments model load attempt', async () => {
    const loadModel = vi.fn(() => new Promise(() => {}));

    const loadPromise = attemptFragmentsModelLoad(loadModel, { timeoutMs: 50 });

    await vi.advanceTimersByTimeAsync(50);
    await expect(loadPromise).resolves.toMatchObject({ status: 'timeout', model: null });
    expect(loadModel).toHaveBeenCalledTimes(1);
  });

  it('loads a fragments model after retrying a stalled first manager', async () => {
    const managers = [
      { id: 'stalled', dispose: vi.fn(async () => {}) },
      { id: 'ready', dispose: vi.fn(async () => {}) },
    ];
    const model = { modelId: 'model-ready', dispose: vi.fn(async () => {}) };
    const createFragments = vi.fn((attempt) => managers[attempt - 1]);
    const loadOnce = vi.fn((fragments) => (
      fragments.id === 'stalled' ? new Promise(() => {}) : Promise.resolve(model)
    ));

    const loadPromise = loadFragmentsModelWithRetries(createFragments, loadOnce, {
      attempts: 2,
      timeoutMs: 50,
    });

    await vi.runAllTimersAsync();
    const result = await loadPromise;

    expect(result).toMatchObject({ status: 'loaded', fragments: managers[1], model, attempts: 2, didTimeout: true });
    expect(createFragments).toHaveBeenCalledTimes(2);
    expect(loadOnce).toHaveBeenCalledTimes(2);
    expect(managers[0].dispose).toHaveBeenCalledTimes(1);
    expect(managers[1].dispose).not.toHaveBeenCalled();
  });

  it('loads a fragments model after retrying a manager that loses the worker model during validation', async () => {
    const managers = [
      { id: 'lost-model', dispose: vi.fn(async () => {}) },
      { id: 'ready', dispose: vi.fn(async () => {}) },
    ];
    const models = [
      { modelId: 'model-a', dispose: vi.fn(async () => {}) },
      { modelId: 'model-b', dispose: vi.fn(async () => {}) },
    ];
    const createFragments = vi.fn((attempt) => managers[attempt - 1]);
    const loadOnce = vi.fn((_fragments, attempt) => Promise.resolve(models[attempt - 1]));
    const validateLoadedModel = vi.fn(({ attempt }) => {
      if (attempt === 1) throw new Error('Fragments: Model not found: model-a');
      return true;
    });

    const result = await loadFragmentsModelWithRetries(createFragments, loadOnce, {
      attempts: 2,
      timeoutMs: 50,
      validateLoadedModel,
    });

    expect(result).toMatchObject({ status: 'loaded', fragments: managers[1], model: models[1], attempts: 2 });
    expect(createFragments).toHaveBeenCalledTimes(2);
    expect(loadOnce).toHaveBeenCalledTimes(2);
    expect(validateLoadedModel).toHaveBeenCalledTimes(2);
    expect(models[0].dispose).toHaveBeenCalledTimes(1);
    expect(managers[0].dispose).toHaveBeenCalledTimes(1);
    expect(models[1].dispose).not.toHaveBeenCalled();
    expect(managers[1].dispose).not.toHaveBeenCalled();
  });

  it('stops retrying after repeated worker model-not-found validation failures', async () => {
    const managers = [
      { id: 'first', dispose: vi.fn(async () => {}) },
      { id: 'second', dispose: vi.fn(async () => {}) },
    ];
    const models = [
      { modelId: 'model-a', dispose: vi.fn(async () => {}) },
      { modelId: 'model-b', dispose: vi.fn(async () => {}) },
    ];
    const createFragments = vi.fn((attempt) => managers[attempt - 1]);
    const loadOnce = vi.fn((_fragments, attempt) => Promise.resolve(models[attempt - 1]));
    const validateLoadedModel = vi.fn(() => {
      throw new Error('Fragments: Model not found: missing');
    });

    await expect(loadFragmentsModelWithRetries(createFragments, loadOnce, {
      attempts: 2,
      timeoutMs: 50,
      validateLoadedModel,
    })).rejects.toThrow('Fragments: Model not found: missing');

    expect(createFragments).toHaveBeenCalledTimes(2);
    expect(loadOnce).toHaveBeenCalledTimes(2);
    expect(validateLoadedModel).toHaveBeenCalledTimes(2);
    expect(models[0].dispose).toHaveBeenCalledTimes(1);
    expect(models[1].dispose).toHaveBeenCalledTimes(1);
    expect(managers[0].dispose).toHaveBeenCalledTimes(1);
    expect(managers[1].dispose).toHaveBeenCalledTimes(1);
  });

  it('returns timeout after all fragments model load attempts stall', async () => {
    const managers = [
      { id: 'first', dispose: vi.fn(async () => {}) },
      { id: 'second', dispose: vi.fn(async () => {}) },
    ];
    const createFragments = vi.fn((attempt) => managers[attempt - 1]);
    const loadOnce = vi.fn(() => new Promise(() => {}));

    const loadPromise = loadFragmentsModelWithRetries(createFragments, loadOnce, {
      attempts: 2,
      timeoutMs: 50,
    });

    await vi.runAllTimersAsync();
    const result = await loadPromise;

    expect(result).toMatchObject({ status: 'timeout', fragments: null, model: null, attempts: 2, didTimeout: true });
    expect(createFragments).toHaveBeenCalledTimes(2);
    expect(loadOnce).toHaveBeenCalledTimes(2);
    expect(managers[0].dispose).toHaveBeenCalledTimes(1);
    expect(managers[1].dispose).toHaveBeenCalledTimes(1);
  });
});
