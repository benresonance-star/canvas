export const FRAGMENTS_MODEL_REGISTRATION_RETRY_DELAYS_MS = [16, 50, 100, 200, 400, 800, 1200, 2000, 3000];
export const FRAGMENTS_UPDATE_BOOT_TIMEOUT_MS = 20000;
export const VIEWPORT_LAYOUT_WAIT_TIMEOUT_MS = 20000;

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

export async function ensureFragmentsUpdated(updateFragments, {
  disposed = () => false,
  maxWaitMs = FRAGMENTS_UPDATE_BOOT_TIMEOUT_MS,
} = {}) {
  const started = performance.now();
  while (performance.now() - started < maxWaitMs) {
    if (disposed()) return false;
    const synced = await updateFragments(true, {
      retryModelRegistration: true,
      requireModelReady: false,
    });
    if (synced) return true;
    await delay(Math.min(300, 32 + Math.floor((performance.now() - started) / 20)));
  }
  return false;
}
