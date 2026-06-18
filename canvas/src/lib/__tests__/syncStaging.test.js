import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  appendCardIfKeyAbsent,
  buildStagedSyncCardFromChange,
  buildConfirmChangesForDialog,
  buildFolderConnectConfirmChanges,
  buildSyncChangesFromFolder,
  filterSyncChangesForConfirm,
  partitionSyncChanges,
  canvasCardToStaged,
  dockCardFromCanvas,
  groupStagedCardsByType,
  mergeNewlyStaged,
  placeStagedCardOnCanvas,
  stagedSyncCardToCanvasCard,
  upsertStagedFromCanvas,
} from '../syncStaging.js';

describe('buildStagedSyncCardFromChange', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', {
      randomUUID: () => 'staging-uuid-1',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds staged card without x/y', () => {
    const staged = buildStagedSyncCardFromChange({
      key: 'img__photo',
      group: {
        parsed: { ext: 'png', prefix: 'img', name: 'photo' },
        versions: [{ version: 1, filename: 'img__photo__v1.png' }],
      },
    });
    expect(staged).toMatchObject({
      stagingId: 'staging-uuid-1',
      key: 'img__photo',
      prefix: 'img',
      name: 'photo',
      type: 'image',
      pinnedVersion: 1,
    });
    expect(staged.x).toBeUndefined();
    expect(staged.y).toBeUndefined();
  });

  it('preserves relative path metadata for nested staged cards', () => {
    const staged = buildStagedSyncCardFromChange({
      key: 'refs/img__photo',
      group: {
        parsed: { ext: 'png', prefix: 'img', name: 'photo' },
        versions: [{
          version: 1,
          filename: 'img__photo-v1.png',
          relativePath: 'refs/img__photo-v1.png',
        }],
      },
    });
    expect(staged).toMatchObject({
      key: 'refs/img__photo',
      relativePath: 'refs/img__photo-v1.png',
      folderPath: 'refs/img__photo-v1.png',
    });
  });
});

describe('mergeNewlyStaged', () => {
  it('does not duplicate keys already in tray', () => {
    const existing = [{ stagingId: 's1', key: 'k1', name: 'A', type: 'image', versions: [], pinnedVersion: 1 }];
    const incoming = [{ stagingId: 's2', key: 'k1', name: 'B', type: 'image', versions: [], pinnedVersion: 1 }];
    const next = mergeNewlyStaged(existing, incoming);
    expect(next).toHaveLength(1);
    expect(next[0].stagingId).toBe('s1');
  });
});

describe('buildSyncChangesFromFolder', () => {
  const grouped = {
    docked: {
      parsed: { name: 'docked', prefix: 'img' },
      versions: [{ version: 1 }, { version: 2 }],
    },
    fresh: {
      parsed: { name: 'fresh', prefix: 'pdf' },
      versions: [{ version: 1 }],
    },
  };

  it('does not mark docked-only keys as new', () => {
    const staged = [{
      key: 'docked',
      stagingId: 's1',
      name: 'docked',
      type: 'image',
      versions: [{ version: 1 }],
      pinnedVersion: 1,
    }];
    const { changes } = buildSyncChangesFromFolder(grouped, [], staged);
    const typesByKey = Object.fromEntries(changes.map((c) => [c.key, c.type]));
    expect(typesByKey.docked).toBe('updated');
    expect(typesByKey.fresh).toBe('new');
  });

  it('does not mark legacy -v1 canvas key as new when folder uses fullBase', () => {
    const grouped = {
      'notes__agent-chat-openai-abc': {
        parsed: { name: 'agent-chat-openai-abc', prefix: 'notes', ext: 'md' },
        versions: [{ version: 1, filename: 'notes__agent-chat-openai-abc-v1.md' }],
      },
    };
    const canvas = [{
      key: 'notes__agent-chat-openai-abc-v1',
      type: 'agent_chat',
      versions: [{ version: 1, filename: 'notes__agent-chat-openai-abc-v1.md' }],
    }];
    const { changes } = buildSyncChangesFromFolder(grouped, canvas, []);
    expect(changes.filter((c) => c.type === 'new')).toHaveLength(0);
  });

  it('treats duplicate basenames in different subfolders as different artifacts', () => {
    const grouped = {
      'floor1/img__photo': {
        parsed: { name: 'photo', prefix: 'img', ext: 'png' },
        versions: [{
          version: 1,
          filename: 'img__photo-v1.png',
          relativePath: 'floor1/img__photo-v1.png',
        }],
      },
      'floor2/img__photo': {
        parsed: { name: 'photo', prefix: 'img', ext: 'png' },
        versions: [{
          version: 1,
          filename: 'img__photo-v1.png',
          relativePath: 'floor2/img__photo-v1.png',
        }],
      },
    };
    const canvas = [{
      key: 'floor1/img__photo',
      type: 'image',
      versions: [{
        version: 1,
        filename: 'img__photo-v1.png',
        relativePath: 'floor1/img__photo-v1.png',
      }],
    }];
    const { changes } = buildSyncChangesFromFolder(grouped, canvas, []);
    expect(changes).toHaveLength(1);
    expect(changes[0].key).toBe('floor2/img__photo');
    expect(changes[0].type).toBe('new');
  });

  it('does not mark general html legacy -v1 canvas key as new', () => {
    const grouped = {
      'general__canvas-primitives-playbook': {
        parsed: { name: 'canvas-primitives-playbook', prefix: 'general', ext: 'html' },
        versions: [{ version: 1, filename: 'general__canvas-primitives-playbook-v1.html' }],
      },
    };
    const canvas = [{
      key: 'general__canvas-primitives-playbook-v1',
      type: 'html',
      versions: [{ version: 1, filename: 'general__canvas-primitives-playbook-v1.html' }],
    }];
    const { changes } = buildSyncChangesFromFolder(grouped, canvas, []);
    expect(changes.filter((c) => c.type === 'new')).toHaveLength(0);
  });

  it('matches folder key by prefix and name when card key is wrong', () => {
    const grouped = {
      'general__Canvas Runtime Analytics': {
        parsed: { name: 'Canvas Runtime Analytics', prefix: 'general', ext: 'html' },
        versions: [{ version: 1, filename: 'general__Canvas Runtime Analytics-v1.html' }],
      },
    };
    const canvas = [{
      key: 'wrong-id',
      prefix: 'general',
      name: 'Canvas Runtime Analytics',
      type: 'html',
      versions: [],
    }];
    const { changes } = buildSyncChangesFromFolder(grouped, canvas, []);
    expect(changes.filter((c) => c.type === 'new')).toHaveLength(0);
  });

  it('does not stage a bookmark sidecar whose URL is already on canvas', () => {
    const grouped = {
      'links__youtu-be-d626e7f3': {
        parsed: { name: 'youtu-be-d626e7f3', prefix: 'links', ext: 'bookmark.md' },
        versions: [{
          version: 1,
          filename: 'links__youtu-be-d626e7f3-v1.bookmark.md',
          externalUrl: 'https://youtu.be/NdkEGdMOobo?si=qDqePqXbXbv6LqEb',
        }],
      },
      'links__ebay-com-au-62c18cac': {
        parsed: { name: 'ebay-com-au-62c18cac', prefix: 'links', ext: 'bookmark.md' },
        versions: [{
          version: 1,
          filename: 'links__ebay-com-au-62c18cac-v1.bookmark.md',
          externalUrl: 'https://www.ebay.com.au/itm/123',
        }],
      },
    };
    const canvas = [{
      id: 'd626e7f3-38a2-4f9c-8f8c-19aa1451bb92',
      key: 'links__youtu-be-7b81c096',
      type: 'bookmark',
      versions: [{
        version: 1,
        filename: 'links__youtu-be-7b81c096-v1.bookmark.md',
        externalUrl: 'https://youtu.be/NdkEGdMOobo?si=qDqePqXbXbv6LqEb',
      }],
    }];

    const confirm = buildConfirmChangesForDialog(grouped, canvas, []);

    expect(confirm).toHaveLength(1);
    expect(confirm[0].key).toBe('links__ebay-com-au-62c18cac');
  });

  it('buildConfirmChangesForDialog uses live canvas after dock placement', () => {
    const grouped = {
      'general__Test Excel': {
        parsed: { name: 'Test Excel', prefix: 'general', ext: 'xlsx' },
        versions: [{ version: 1, filename: 'general__Test Excel-v1.xlsx' }],
      },
    };
    const staleCanvas = [];
    const staleStaged = [{
      key: 'general__Test Excel',
      stagingId: 's1',
      name: 'Test Excel',
      type: 'spreadsheet',
      versions: [{ version: 1 }],
      pinnedVersion: 1,
    }];
    const { changes: staleChanges } = buildSyncChangesFromFolder(
      grouped,
      staleCanvas,
      staleStaged,
    );
    expect(staleChanges.some((c) => c.type === 'new')).toBe(false);

    const liveCanvas = [{
      id: 'c1',
      key: 'general__Test Excel',
      prefix: 'general',
      name: 'Test Excel',
      type: 'spreadsheet',
      versions: [{ version: 1, filename: 'general__Test Excel-v1.xlsx' }],
      x: 100,
      y: 100,
    }];
    const liveStaged = [];
    const confirm = buildConfirmChangesForDialog(grouped, liveCanvas, liveStaged);
    expect(confirm).toHaveLength(0);
  });

  it('buildFolderConnectConfirmChanges lists disk files when server already has staged rows', () => {
    const grouped = {
      'notes__readme': {
        parsed: { name: 'readme', prefix: 'notes', ext: 'md' },
        versions: [{ version: 1, filename: 'notes__readme-v1.md' }],
      },
    };
    const staged = [{
      key: 'notes__readme',
      stagingId: 's1',
      name: 'readme',
      prefix: 'notes',
      type: 'markdown',
      versions: [{ version: 1, filename: 'notes__readme-v1.md' }],
      pinnedVersion: 1,
    }];
    expect(buildConfirmChangesForDialog(grouped, [], staged)).toHaveLength(0);
    const connect = buildFolderConnectConfirmChanges(grouped, [], staged);
    expect(connect).toHaveLength(1);
    expect(connect[0].key).toBe('notes__readme');
  });

  it('filterSyncChangesForConfirm drops false-new general html on canvas', () => {
    const changes = [{
      type: 'new',
      key: 'general__canvas-primitives-playbook',
      group: {
        parsed: { name: 'canvas-primitives-playbook', prefix: 'general', ext: 'html' },
        versions: [{ version: 1 }],
      },
    }];
    const canvas = [{
      key: 'general__canvas-primitives-playbook-v1',
      type: 'html',
      versions: [{ version: 1, filename: 'general__canvas-primitives-playbook-v1.html' }],
    }];
    expect(filterSyncChangesForConfirm(changes, canvas)).toHaveLength(0);
  });

  it('partitionSyncChanges routes agent_chat new to auto-stage', () => {
    const changes = [
      {
        type: 'new',
        key: 'notes__agent-chat-openai-x',
        group: {
          parsed: { name: 'agent-chat-openai-x', prefix: 'notes', ext: 'md' },
          versions: [{ version: 1 }],
        },
      },
      {
        type: 'new',
        key: 'img__photo',
        group: {
          parsed: { name: 'photo', prefix: 'img', ext: 'png' },
          versions: [{ version: 1 }],
        },
      },
    ];
    const { autoStageAgentChat, confirmChanges } = partitionSyncChanges(changes);
    expect(autoStageAgentChat).toHaveLength(1);
    expect(confirmChanges).toHaveLength(1);
    expect(confirmChanges[0].key).toBe('img__photo');
  });

  it('mergeNewlyStaged dedupes canonical vs legacy key', () => {
    const staged = [
      {
        stagingId: 's1',
        key: 'notes__agent-chat-openai-abc-v1',
        type: 'agent_chat',
        versions: [{ filename: 'notes__agent-chat-openai-abc-v1.md' }],
      },
    ];
    const incoming = [
      {
        stagingId: 's2',
        key: 'notes__agent-chat-openai-abc',
        type: 'agent_chat',
        versions: [{ filename: 'notes__agent-chat-openai-abc-v1.md' }],
      },
    ];
    const merged = mergeNewlyStaged(staged, incoming);
    expect(merged).toHaveLength(1);
  });

  it('filterSyncChangesForConfirm drops false-new agent_chat on canvas', () => {
    const changes = [{
      type: 'new',
      key: 'notes__agent-chat-openai-x',
      group: {
        parsed: { name: 'agent-chat-openai-x', prefix: 'notes', ext: 'md' },
        versions: [{ version: 1 }],
      },
    }];
    const canvas = [{
      key: 'notes__agent-chat-openai-x-v1',
      type: 'agent_chat',
      versions: [{ version: 1, filename: 'notes__agent-chat-openai-x-v1.md' }],
    }];
    expect(filterSyncChangesForConfirm(changes, canvas)).toHaveLength(0);
  });

  it('reports updated when docked file gains a version', () => {
    const staged = [{
      key: 'docked',
      stagingId: 's1',
      name: 'docked',
      type: 'image',
      versions: [{ version: 1 }],
      pinnedVersion: 1,
    }];
    const { changes } = buildSyncChangesFromFolder(
      { docked: grouped.docked },
      [],
      staged,
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('updated');
    expect(changes[0].newVersions).toHaveLength(1);
    expect(changes[0].newVersions[0].version).toBe(2);
  });
});

describe('appendCardIfKeyAbsent', () => {
  it('appends when key is not present', () => {
    const cards = [{ key: 'a', id: '1' }];
    const next = appendCardIfKeyAbsent(cards, { key: 'b', id: '2' });
    expect(next).toHaveLength(2);
    expect(next[1].key).toBe('b');
  });

  it('does not append duplicate key', () => {
    const cards = [{ key: 'a', id: '1' }];
    const next = appendCardIfKeyAbsent(cards, { key: 'a', id: '2' });
    expect(next).toBe(cards);
    expect(next).toHaveLength(1);
  });
});

describe('placeStagedCardOnCanvas', () => {
  const staged = {
    stagingId: 's1',
    key: 'img__photo',
    prefix: 'img',
    name: 'photo',
    type: 'image',
    versions: [],
    pinnedVersion: 1,
  };

  beforeEach(() => {
    let n = 0;
    vi.stubGlobal('crypto', {
      randomUUID: () => `card-uuid-${++n}`,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('appends card when key is not on canvas', () => {
    const { cards, placed, movedExisting } = placeStagedCardOnCanvas(
      [],
      staged,
      200,
      150,
    );
    expect(placed).toBe(true);
    expect(movedExisting).toBe(false);
    expect(cards).toHaveLength(1);
    expect(cards[0].key).toBe('img__photo');
  });

  it('moves existing card to drop when key is already on canvas', () => {
    const existing = {
      id: 'existing-1',
      key: 'img__photo',
      x: 10,
      y: 20,
      type: 'image',
    };
    const { cards, placed, movedExisting } = placeStagedCardOnCanvas(
      [existing],
      staged,
      500,
      400,
    );
    expect(placed).toBe(true);
    expect(movedExisting).toBe(true);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe('existing-1');
    expect(cards[0].x).not.toBe(10);
    expect(cards[0].y).not.toBe(20);
  });
});

describe('canvasCardToStaged', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', {
      randomUUID: () => 'dock-staging-1',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps canvas card to staged without x/y', () => {
    const staged = canvasCardToStaged({
      id: 'card-1',
      key: 'img__photo',
      prefix: 'img',
      name: 'photo',
      type: 'image',
      versions: [{ version: 1 }],
      pinnedVersion: 1,
      x: 100,
      y: 200,
    });
    expect(staged).toMatchObject({
      stagingId: 'dock-staging-1',
      key: 'img__photo',
      type: 'image',
    });
    expect(staged.x).toBeUndefined();
  });

  it('preserves nested relative path from canvas card', () => {
    const staged = canvasCardToStaged({
      id: 'card-1',
      key: 'refs/img__photo',
      prefix: 'img',
      name: 'photo',
      type: 'image',
      versions: [{
        version: 1,
        filename: 'img__photo-v1.png',
        relativePath: 'refs/img__photo-v1.png',
      }],
    });
    expect(staged.relativePath).toBe('refs/img__photo-v1.png');
  });

  it('falls back to card id when key is missing', () => {
    const staged = canvasCardToStaged({
      id: 'note-1',
      type: 'user_note',
      versions: [],
    });
    expect(staged.key).toBe('note-1');
  });
});

describe('upsertStagedFromCanvas', () => {
  it('replaces staged entry with same key', () => {
    const existing = {
      stagingId: 'old',
      key: 'k1',
      name: 'old',
      type: 'image',
      versions: [],
      pinnedVersion: 1,
    };
    const next = upsertStagedFromCanvas([existing], {
      stagingId: 'new',
      key: 'k1',
      name: 'new',
      type: 'image',
      versions: [],
      pinnedVersion: 1,
    });
    expect(next).toHaveLength(1);
    expect(next[0].stagingId).toBe('new');
    expect(next[0].name).toBe('new');
  });
});

describe('dockCardFromCanvas', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', {
      randomUUID: () => 'dock-staging-1',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('removes card and adds to staged', () => {
    const cards = [
      { id: 'c1', key: 'k1', name: 'A', type: 'image', versions: [], x: 0, y: 0 },
      { id: 'c2', key: 'k2', name: 'B', type: 'pdf', versions: [], x: 10, y: 10 },
    ];
    const result = dockCardFromCanvas(cards, [], 'c1');
    expect(result.docked).toBe(true);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].id).toBe('c2');
    expect(result.stagedCards).toHaveLength(1);
    expect(result.stagedCards[0].key).toBe('k1');
  });

  it('returns docked false when card missing', () => {
    const result = dockCardFromCanvas([], [], 'missing');
    expect(result.docked).toBe(false);
  });
});

describe('stagedSyncCardToCanvasCard', () => {
  beforeEach(() => {
    let n = 0;
    vi.stubGlobal('crypto', {
      randomUUID: () => `card-uuid-${++n}`,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('centers card on world drop point', () => {
    const staged = {
      stagingId: 's1',
      key: 'k',
      prefix: 'p',
      name: 'n',
      type: 'image',
      versions: [],
      pinnedVersion: 1,
    };
    const card = stagedSyncCardToCanvasCard(staged, 500, 400);
    expect(card.id).toBe('card-uuid-1');
    expect(card.x).toBeLessThan(500);
    expect(card.y).toBeLessThan(400);
    expect(card.x + card.y).toBeGreaterThan(0);
  });

  it('preserves nested relative path on canvas cards', () => {
    const staged = {
      stagingId: 's1',
      key: 'refs/img__photo',
      relativePath: 'refs/img__photo-v1.png',
      prefix: 'img',
      name: 'photo',
      type: 'image',
      versions: [{ version: 1, filename: 'img__photo-v1.png', relativePath: 'refs/img__photo-v1.png' }],
      pinnedVersion: 1,
    };
    const card = stagedSyncCardToCanvasCard(staged, 500, 400);
    expect(card.relativePath).toBe('refs/img__photo-v1.png');
  });
});

describe('groupStagedCardsByType', () => {
  it('groups cards by normalized type in stable order', () => {
    const staged = [
      { stagingId: '1', type: 'image', name: 'a' },
      { stagingId: '2', type: 'markdown', name: 'b' },
      { stagingId: '3', type: 'image', name: 'c' },
      { stagingId: '4', type: 'note', name: 'd' },
    ];
    const groups = groupStagedCardsByType(staged);
    expect(groups.map((g) => g.type)).toEqual(['markdown', 'image']);
    expect(groups[0].cards).toHaveLength(2);
    expect(groups[1].cards).toHaveLength(2);
    expect(groups[0].cards[0].stagingId).toBe('2');
    expect(groups[1].cards.map((c) => c.stagingId)).toEqual(['1', '3']);
  });
});
