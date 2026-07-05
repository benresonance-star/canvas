export const FRAGMENTS_MODEL_REGISTRATION_RETRY_DELAYS_MS = [16, 50, 100, 200, 400, 800, 1200, 2000, 3000];
export const FRAGMENTS_UPDATE_BOOT_TIMEOUT_MS = 20000;
export const FRAGMENTS_BOOT_SYNC_TIMEOUT_MS = 20000;
export const FRAGMENTS_BOOT_UPDATE_ATTEMPT_TIMEOUT_MS = 8000;
export const FRAGMENTS_MODEL_LOAD_ATTEMPT_TIMEOUT_MS = 20000;
export const FRAGMENTS_MODEL_LOAD_ATTEMPTS_DEFAULT = 2;
export const FRAGMENTS_BOOT_IDLE_TIMEOUT_MS = 10000;
export const VIEWPORT_LAYOUT_WAIT_TIMEOUT_MS = 20000;

export const BIM_VIEWPORT_LOAD_PHASES = {
  preparing: 'Preparing viewer…',
  reading: 'Reading model data…',
  loadingGeometry: 'Loading 3D geometry…',
  registering: 'Registering model…',
  buildingView: 'Building view…',
  syncing: 'Syncing geometry…',
  finishing: 'Finishing up…',
};

export function resolveBimViewportRuntimeModelId(preparedModel) {
  const preparedFragmentsModelId = preparedModel?.metadata?.fragmentsModelId;
  if (preparedFragmentsModelId) return String(preparedFragmentsModelId);

  const sourceId = preparedModel?.metadata?.fingerprint
    ?? preparedModel?.metadata?.sourceFileHash
    ?? 'model';
  const sanitized = String(sourceId)
    .replace(/^canvas-bim-/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 32)
    .replace(/^-+|-+$/g, '');
  return `canvas-bim-${sanitized || 'model'}`;
}

export function configureFragmentsManagerForBimViewport(fragments) {
  if (!fragments?.settings) return fragments;
  fragments.settings.graphicsQuality = 1;
  fragments.settings.autoCoordinate = false;
  return fragments;
}

export function delay(ms) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

export function hasViewportLayoutSize(width, height) {
  return width > 1 && height > 1;
}

export function isFragmentsModelRegistered(fragments, modelId) {
  if (!fragments || !modelId) return false;
  return Boolean(fragments.models?.list?.has(modelId));
}

export function isFragmentsModelNotFoundError(error) {
  return String(error?.message ?? error).includes('Fragments: Model not found');
}

export function isRetryableFragmentsBootError(error) {
  const message = String(error?.message ?? error);
  return isFragmentsModelNotFoundError(error)
    || message.includes('Fragments worker did not register the model during load');
}

export function waitForAnimationFrame() {
  return new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === 'function') {
      globalThis.requestAnimationFrame(() => resolve());
      return;
    }
    globalThis.setTimeout(resolve, 16);
  });
}

export async function waitForViewportLayout(container, {
  disposed = () => false,
  timeoutMs = VIEWPORT_LAYOUT_WAIT_TIMEOUT_MS,
} = {}) {
  const isReady = () => {
    if (disposed()) return false;
    const rect = container.getBoundingClientRect();
    const width = Math.max(0, Math.floor(rect.width));
    const height = Math.max(0, Math.floor(rect.height));
    return hasViewportLayoutSize(width, height);
  };

  if (isReady()) return true;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      globalThis.clearTimeout(timerId);
      resolve(value);
    };

    const observer = new ResizeObserver(() => {
      if (isReady()) finish(true);
    });

    let node = container;
    while (node) {
      observer.observe(node);
      node = node.parentElement;
    }

    const timerId = globalThis.setTimeout(() => finish(isReady()), timeoutMs);
  });
}

export async function waitForFragmentsModelRegistered(fragments, modelId, {
  disposed = () => false,
  timeoutMs = FRAGMENTS_UPDATE_BOOT_TIMEOUT_MS,
} = {}) {
  if (isFragmentsModelRegistered(fragments, modelId)) return true;

  const waitForEvent = new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      fragments?.onModelLoaded?.remove?.(handleLoaded);
      globalThis.clearTimeout(timerId);
      resolve(value);
    };
    const handleLoaded = (model) => {
      if (model?.modelId === modelId) finish(true);
    };
    fragments?.onModelLoaded?.add?.(handleLoaded);
    const timerId = globalThis.setTimeout(
      () => finish(isFragmentsModelRegistered(fragments, modelId)),
      timeoutMs,
    );
  });

  const waitForPoll = (async () => {
    const started = performance.now();
    while (performance.now() - started < timeoutMs) {
      if (disposed()) return false;
      if (isFragmentsModelRegistered(fragments, modelId)) return true;
      await delay(16);
    }
    return isFragmentsModelRegistered(fragments, modelId);
  })();

  return Boolean(await Promise.race([waitForEvent, waitForPoll]));
}

export async function waitForFragmentsModelIdle(model, {
  disposed = () => false,
  timeoutMs = FRAGMENTS_UPDATE_BOOT_TIMEOUT_MS,
} = {}) {
  if (!model) return false;
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    if (disposed()) return false;
    if (model.isBusy === false) return true;
    await delay(16);
  }
  return model.isBusy === false;
}

export async function primeViewportRendererForBoot(renderer, scene, camera) {
  if (!renderer || !scene || !camera) return;
  renderer.render(scene, camera);
  await waitForAnimationFrame();
  await waitForAnimationFrame();
  renderer.render(scene, camera);
}

let fragmentsBootUpdateTail = Promise.resolve();

function enqueueFragmentsBootUpdate(task) {
  const next = fragmentsBootUpdateTail.then(task, task);
  fragmentsBootUpdateTail = next.catch(() => {});
  return next;
}

export function resetFragmentsBootUpdateQueue() {
  fragmentsBootUpdateTail = Promise.resolve();
}

export async function syncFragmentsForViewportBoot(updateFragments, {
  disposed = () => false,
  maxWaitMs = FRAGMENTS_BOOT_SYNC_TIMEOUT_MS,
  attemptTimeoutMs = FRAGMENTS_BOOT_UPDATE_ATTEMPT_TIMEOUT_MS,
} = {}) {
  const synced = await attemptFragmentsBootUpdate(updateFragments, {
    retryModelRegistration: true,
    requireModelReady: false,
  }, attemptTimeoutMs);
  if (synced || disposed()) return synced;
  return ensureFragmentsUpdated(updateFragments, { disposed, maxWaitMs, attemptTimeoutMs });
}

export async function ensureFragmentsUpdated(updateFragments, {
  disposed = () => false,
  maxWaitMs = FRAGMENTS_UPDATE_BOOT_TIMEOUT_MS,
  attemptTimeoutMs = FRAGMENTS_BOOT_UPDATE_ATTEMPT_TIMEOUT_MS,
} = {}) {
  const started = performance.now();
  while (performance.now() - started < maxWaitMs) {
    if (disposed()) return false;
    const synced = await attemptFragmentsBootUpdate(updateFragments, {
      retryModelRegistration: true,
      requireModelReady: false,
    }, attemptTimeoutMs);
    if (synced) return true;
    await delay(Math.min(300, 32 + Math.floor((performance.now() - started) / 20)));
  }
  return false;
}

export async function attemptFragmentsBootUpdate(updateFragments, options = {}, timeoutMs = FRAGMENTS_BOOT_UPDATE_ATTEMPT_TIMEOUT_MS) {
  return enqueueFragmentsBootUpdate(async () => {
    let timedOut = false;
    const updatePromise = Promise.resolve()
      .then(() => updateFragments(true, options))
      .catch((error) => {
        if (timedOut) return false;
        throw error;
      });
    const timeoutPromise = delay(timeoutMs).then(() => {
      timedOut = true;
      return false;
    });
    const raced = await Promise.race([updatePromise, timeoutPromise]);
    await Promise.race([
      updatePromise.catch(() => false),
      timedOut ? delay(2000) : Promise.resolve(),
    ]);
    return Boolean(raced);
  });
}

export async function attemptFragmentsModelLoad(loadModel, {
  timeoutMs = FRAGMENTS_MODEL_LOAD_ATTEMPT_TIMEOUT_MS,
  onLateModel,
} = {}) {
  let timedOut = false;
  const loadPromise = Promise.resolve()
    .then(loadModel)
    .then((model) => {
      if (timedOut) {
        void Promise.resolve(onLateModel?.(model)).catch(() => {});
        return { status: 'timeout', model: null };
      }
      return { status: 'loaded', model };
    })
    .catch((error) => {
      if (timedOut) return { status: 'timeout', model: null };
      throw error;
    });

  const timeoutPromise = delay(timeoutMs).then(() => {
    timedOut = true;
    return { status: 'timeout', model: null };
  });

  return Promise.race([loadPromise, timeoutPromise]);
}

export async function loadFragmentsModelWithRetries(createFragments, loadOnce, {
  attempts = FRAGMENTS_MODEL_LOAD_ATTEMPTS_DEFAULT,
  timeoutMs = FRAGMENTS_MODEL_LOAD_ATTEMPT_TIMEOUT_MS,
  disposed = () => false,
  disposeFragments = (fragments) => fragments?.dispose?.(),
  disposeModel = (model) => model?.dispose?.(),
  validateLoadedModel = null,
  isRetryableLoadError = isRetryableFragmentsBootError,
} = {}) {
  let didTimeout = false;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (disposed()) return { status: 'disposed', fragments: null, model: null, attempts: attempt - 1, didTimeout };
    const fragments = createFragments(attempt);
    let result;
    try {
      result = await attemptFragmentsModelLoad(
        () => loadOnce(fragments, attempt),
        {
          timeoutMs,
          onLateModel: disposeModel,
        },
      );
    } catch (error) {
      lastError = error;
      await Promise.resolve(disposeFragments(fragments)).catch(() => {});
      if (disposed()) return { status: 'disposed', fragments: null, model: null, attempts: attempt, didTimeout };
      if (attempt < attempts && isRetryableLoadError(error)) continue;
      throw error;
    }

    if (disposed()) {
      await Promise.resolve(disposeModel(result.model)).catch(() => {});
      await Promise.resolve(disposeFragments(fragments)).catch(() => {});
      return { status: 'disposed', fragments: null, model: null, attempts: attempt, didTimeout };
    }

    if (result.status === 'loaded' && result.model) {
      if (validateLoadedModel) {
        try {
          await validateLoadedModel({ fragments, model: result.model, attempt });
        } catch (error) {
          lastError = error;
          await Promise.resolve(disposeModel(result.model)).catch(() => {});
          await Promise.resolve(disposeFragments(fragments)).catch(() => {});
          if (disposed()) return { status: 'disposed', fragments: null, model: null, attempts: attempt, didTimeout };
          if (attempt < attempts && isRetryableLoadError(error)) continue;
          throw error;
        }
      }
      return { status: 'loaded', fragments, model: result.model, attempts: attempt, didTimeout };
    }

    didTimeout = true;
    await Promise.resolve(disposeFragments(fragments)).catch(() => {});
  }

  return { status: didTimeout ? 'timeout' : 'failed', fragments: null, model: null, attempts, didTimeout, error: lastError };
}
