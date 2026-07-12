import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  applySourceStorageKeyToCard,
  createBimViewerCardFromFolderStaged,
  isFolderIfcStagedEntry,
  isBimViewerSessionCanvasCard,
  bimSourceStorageKey,
} from '../ingest/bimViewerFromFolder.js';

describe('bimViewerFromFolder', () => {
  beforeEach(() => {
    let n = 0;
    vi.stubGlobal('crypto', {
      randomUUID: () => `uuid-${++n}`,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects folder-sync dock IFC entries', () => {
    expect(isFolderIfcStagedEntry({
      type: 'bim-model',
      versions: [{ version: 1, filename: 'clinic.ifc' }],
      pinnedVersion: 1,
    })).toBe(true);
    expect(isFolderIfcStagedEntry({
      type: 'bim-model',
      versions: [{ version: 1, bim: { viewerKind: 'ifc-viewer-session' } }],
      pinnedVersion: 1,
    })).toBe(false);
  });

  it('creates a bim-viewers session card from folder dock staging', () => {
    const staged = {
      key: 'IFC/Resort Villa',
      name: 'Resort Villa',
      relativePath: 'IFC/Resort Villa.ifc',
      type: 'bim-model',
      prefix: 'general',
      versions: [{
        version: 1,
        filename: 'Resort Villa.ifc',
        relativePath: 'IFC/Resort Villa.ifc',
        content_hash: 'abc123def456',
        lastModified: 1000,
        size: 2048,
      }],
      pinnedVersion: 1,
    };
    const card = createBimViewerCardFromFolderStaged(staged, 400, 300);
    expect(card.prefix).toBe('bim-viewers');
    expect(card.key).toMatch(/^bim-viewers__/);
    expect(card.folderSyncKey).toBe('IFC/Resort Villa');
    expect(card.versions[0].bim.viewerKind).toBe('ifc-viewer-session');
    const modelRef = card.versions[0].bim.session.modelRefs[0];
    expect(modelRef.sourceKind).toBe('linkedFolder');
    expect(modelRef.sourcePath).toBe('IFC/Resort Villa.ifc');
    expect(modelRef.sourceFileHash).toBe('abc123def456');
    expect(modelRef.modelId).toBe('bim-model:abc123def456');
    expect(isBimViewerSessionCanvasCard(card)).toBe(true);
  });

  it('applies source storage key to the first session model ref', () => {
    const card = createBimViewerCardFromFolderStaged({
      key: 'models__clinic',
      name: 'clinic',
      type: 'bim-model',
      versions: [{ version: 1, content_hash: 'hash1', filename: 'clinic.ifc' }],
      pinnedVersion: 1,
    }, 100, 100);
    const storageKey = bimSourceStorageKey('hash1');
    const next = applySourceStorageKeyToCard(card, storageKey);
    expect(next.versions[0].bim.session.modelRefs[0].sourceStorageKey).toBe(storageKey);
  });
});
