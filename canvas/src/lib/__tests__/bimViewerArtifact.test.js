import { describe, expect, it } from 'vitest';
import {
  isBimViewerSessionCard,
  stableBimViewerIdentity,
  bimViewerArtifactPayload,
} from '../ingest/bimViewerArtifact.js';

describe('bimViewerArtifact', () => {
  const card = {
    id: 'card-1',
    key: 'bim-viewers__card-1',
    prefix: 'bim-viewers',
    name: 'IFC Viewer',
    type: 'bim-model',
    pinnedVersion: 1,
    versions: [{
      version: 1,
      filename: 'IFC Viewer.ifc-viewer.json',
      bim: {
        viewerKind: 'ifc-viewer-session',
        session: { id: 'bim-session:card-1', modelRefs: [] },
      },
    }],
  };

  it('detects IFC viewer session cards', () => {
    expect(isBimViewerSessionCard(card)).toBe(true);
  });

  it('builds stable identity and payload', () => {
    const pinned = card.versions[0];
    expect(stableBimViewerIdentity(card, pinned)).toBe(
      'bim-viewer-session:bim-viewers__card-1:bim-session:card-1',
    );
    const payload = JSON.parse(bimViewerArtifactPayload(card, pinned));
    expect(payload.viewerKind).toBe('ifc-viewer-session');
    expect(payload.cardKey).toBe('bim-viewers__card-1');
  });
});
