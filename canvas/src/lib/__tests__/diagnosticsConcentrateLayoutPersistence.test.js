import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getArchitectureActionById } from '../architecture/architectureActions.js';
import { ARCHITECTURE_SPEC_VERSION } from '../systemArchitectureSpec.js';
import { diagnosticsConcentrateLayoutStorageKey } from '../constants.js';
import {
  emptyConcentrateActionLayout,
  readCachedConcentrateLayout,
  sanitizeConcentrateLayout,
  writeCachedConcentrateLayout,
} from '../diagnosticsConcentrateLayoutPersistence.js';

describe('diagnosticsConcentrateLayoutPersistence', () => {
  const action = getArchitectureActionById('add_note');

  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      store: /** @type {Record<string, string>} */ ({}),
      getItem(key) {
        return this.store[key] ?? null;
      },
      setItem(key, value) {
        this.store[key] = value;
      },
      removeItem(key) {
        delete this.store[key];
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns empty layout when cache is missing', () => {
    expect(readCachedConcentrateLayout('add_note', ARCHITECTURE_SPEC_VERSION)).toBeNull();
  });

  it('round-trips cached layout through localStorage', () => {
    const layout = {
      actionId: 'add_note',
      specVersion: ARCHITECTURE_SPEC_VERSION,
      nodeOverrides: { addMenu: { centerX: 10, centerY: 20 } },
      edgeAnchors: { 'pipe-addMenu-newNoteDialog': { x: 5, y: 6 } },
      updatedAt: '2026-07-03T00:00:00.000Z',
    };
    writeCachedConcentrateLayout(layout);

    const key = diagnosticsConcentrateLayoutStorageKey('add_note', ARCHITECTURE_SPEC_VERSION);
    expect(localStorage.getItem(key)).toBeTruthy();

    const loaded = readCachedConcentrateLayout('add_note', ARCHITECTURE_SPEC_VERSION);
    expect(loaded?.nodeOverrides.addMenu).toEqual({ centerX: 10, centerY: 20 });
    expect(loaded?.edgeAnchors['pipe-addMenu-newNoteDialog']).toEqual({ x: 5, y: 6 });
  });

  it('ignores cached layout when spec version mismatches', () => {
    writeCachedConcentrateLayout({
      ...emptyConcentrateActionLayout('add_note', 'old-spec'),
      nodeOverrides: { addMenu: { centerX: 1, centerY: 2 } },
    });

    const loaded = readCachedConcentrateLayout('add_note', ARCHITECTURE_SPEC_VERSION);
    expect(loaded).toBeNull();
  });

  it('sanitizes node and edge ids to action membership', () => {
    const layout = {
      actionId: 'add_note',
      specVersion: ARCHITECTURE_SPEC_VERSION,
      nodeOverrides: {
        addMenu: { centerX: 10, centerY: 20 },
        flowEditor: { centerX: 99, centerY: 99 },
      },
      edgeAnchors: {
        'pipe-addMenu-newNoteDialog': { x: 1, y: 2 },
        'pipe-flowEditor-apiFlows': { x: 9, y: 9 },
      },
      updatedAt: null,
    };

    const sanitized = sanitizeConcentrateLayout(action, layout);
    expect(sanitized.nodeOverrides.addMenu).toEqual({ centerX: 10, centerY: 20 });
    expect(sanitized.nodeOverrides.flowEditor).toBeUndefined();
    expect(sanitized.edgeAnchors['pipe-addMenu-newNoteDialog']).toEqual({ x: 1, y: 2 });
    expect(sanitized.edgeAnchors['pipe-flowEditor-apiFlows']).toBeUndefined();
  });
});
