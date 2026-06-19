import { describe, expect, it } from 'vitest';
import {
  fileTypeFromExt,
  cardTypeLabel,
  cardHeaderPrefix,
  cardHeaderLabel,
  cardExtensionLabel,
  cardDisplayFilename,
  isTextMarkdownPreviewType,
  isCodePreviewType,
  cardKeyFromFilename,
  folderKeyFromRelativePath,
  toCanonicalSyncKey,
  syncKeysMatch,
  resolveLoadedCardType,
  noteRequiresProjectOnlySave,
  computeUserNoteDisabled,
  isCardMissingFromFolder,
} from '../filename.js';

describe('sync key helpers', () => {
  it('cardKeyFromFilename uses fullBase without version suffix', () => {
    expect(cardKeyFromFilename('notes__agent-chat-openai-abc12345-v1.md')).toBe(
      'notes__agent-chat-openai-abc12345',
    );
  });

  it('toCanonicalSyncKey normalizes legacy card keys', () => {
    expect(toCanonicalSyncKey('notes__agent-chat-openai-abc12345-v1')).toBe(
      'notes__agent-chat-openai-abc12345',
    );
  });

  it('syncKeysMatch equates filename and legacy card key', () => {
    expect(
      syncKeysMatch(
        'notes__agent-chat-openai-abc12345-v1',
        'notes__agent-chat-openai-abc12345',
      ),
    ).toBe(true);
  });

  it('keeps root file keys backward compatible', () => {
    expect(folderKeyFromRelativePath('notes__site-plan-v2.md')).toBe('notes__site-plan');
    expect(toCanonicalSyncKey('notes__site-plan-v2.md')).toBe('notes__site-plan');
  });

  it('uses normalized relative paths for nested file keys', () => {
    expect(folderKeyFromRelativePath('refs/images/img__photo-v3.png')).toBe(
      'refs/images/img__photo',
    );
    expect(cardKeyFromFilename('refs\\images\\img__photo-v3.png')).toBe(
      'refs/images/img__photo',
    );
    expect(toCanonicalSyncKey('refs/images/img__photo-v3.png')).toBe(
      'refs/images/img__photo',
    );
  });

  it('matches nested filename and nested card key', () => {
    expect(
      syncKeysMatch(
        'refs/images/img__photo-v3.png',
        'refs/images/img__photo',
      ),
    ).toBe(true);
  });
});

describe('fileTypeFromExt audio', () => {
  it('maps common audio extensions to audio', () => {
    for (const ext of ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac']) {
      expect(fileTypeFromExt(ext)).toBe('audio');
    }
  });

  it('labels audio cards', () => {
    expect(cardTypeLabel('audio')).toBe('AUDIO');
  });
});

describe('fileTypeFromExt code', () => {
  it('maps TypeScript and JavaScript extensions to code', () => {
    for (const ext of ['ts', 'tsx', 'js', 'jsx']) {
      expect(fileTypeFromExt(ext)).toBe('code');
    }
  });

  it('labels code cards', () => {
    expect(cardTypeLabel('code')).toBe('CODE');
  });

  it('detects code preview types separately from markdown', () => {
    expect(isCodePreviewType('code')).toBe(true);
    expect(isTextMarkdownPreviewType('code')).toBe(false);
  });
});

describe('isTextMarkdownPreviewType', () => {
  it('includes markdown, note, and agent_chat', () => {
    expect(isTextMarkdownPreviewType('markdown')).toBe(true);
    expect(isTextMarkdownPreviewType('note')).toBe(true);
    expect(isTextMarkdownPreviewType('agent_chat')).toBe(true);
  });

  it('excludes other card types', () => {
    expect(isTextMarkdownPreviewType('pdf')).toBe(false);
    expect(isTextMarkdownPreviewType('user_note')).toBe(false);
  });

  it('labels agent_chat as CHAT', () => {
    expect(cardTypeLabel('agent_chat')).toBe('CHAT');
  });

  it('cardHeaderPrefix uses thread for agent_chat cards', () => {
    expect(
      cardHeaderPrefix({ type: 'agent_chat', prefix: 'notes' }),
    ).toBe('thread');
    expect(cardHeaderPrefix({ type: 'user_note', prefix: 'notes' })).toBe('notes');
  });

  it('cardHeaderLabel shows THREAD | CHAT for agent_chat without extension metadata', () => {
    expect(
      cardHeaderLabel({ type: 'agent_chat', prefix: 'notes' }),
    ).toBe('thread | CHAT');
  });

  it('cardHeaderLabel omits file extension from header', () => {
    const card = {
      type: 'code',
      prefix: 'general',
      name: 'agent',
      pinnedVersion: 1,
      versions: [{ version: 1, filename: 'general__agent-v1.ts' }],
    };
    expect(cardExtensionLabel(card)).toBe('TS');
    expect(cardHeaderLabel(card)).toBe('general | CODE');
    expect(cardDisplayFilename(card)).toBe('agent.ts');
  });
});

describe('resolveLoadedCardType', () => {
  it('migrates notes__ markdown cards to user_note', () => {
    expect(
      resolveLoadedCardType({
        type: 'markdown',
        prefix: 'notes',
        key: 'notes__my-note',
      }),
    ).toBe('user_note');
  });

  it('migrates legacy note type under notes prefix', () => {
    expect(
      resolveLoadedCardType({
        type: 'note',
        key: 'notes__legacy',
      }),
    ).toBe('user_note');
  });

  it('keeps markdown__ files as markdown', () => {
    expect(
      resolveLoadedCardType({
        type: 'markdown',
        prefix: 'markdown',
        key: 'markdown__readme',
      }),
    ).toBe('markdown');
  });

  it('migrates legacy file rows with TypeScript versions to code', () => {
    expect(
      resolveLoadedCardType({
        type: 'file',
        key: 'src__example',
        versions: [{ filename: 'src__example-v1.ts' }],
      }),
    ).toBe('code');
  });
});

describe('isCardMissingFromFolder', () => {
  it('does not flag bookmark cards when absent from folder scan', () => {
    expect(
      isCardMissingFromFolder({
        folderConnected: true,
        folderKeySet: new Set(['notes__a']),
        card: { key: 'links__example-com', type: 'bookmark', prefix: 'links' },
      }),
    ).toBe(false);
  });

  it('flags folder-backed cards missing from scan', () => {
    expect(
      isCardMissingFromFolder({
        folderConnected: true,
        folderKeySet: new Set(['notes__a']),
        card: { key: 'notes__b', type: 'user_note', prefix: 'notes' },
      }),
    ).toBe(true);
  });

  it('matches card by version filename when card.key differs', () => {
    expect(
      isCardMissingFromFolder({
        folderConnected: true,
        folderKeySet: new Set(['notes__legacy']),
        card: {
          key: 'notes__legacy-v1',
          type: 'markdown',
          prefix: 'notes',
          versions: [{ filename: 'notes__legacy-v1.md', version: 1 }],
        },
      }),
    ).toBe(false);
  });

  it('collectFolderBackedKeys includes project artifact keys', async () => {
    const { collectFolderBackedKeys } = await import(
      '../filename.js'
    );
    const keys = collectFolderBackedKeys(
      [{ key: 'notes__on_canvas', type: 'markdown', versions: [] }],
      [{ key: 'img__staged', type: 'image', versions: [] }],
    );
    expect(keys).toContain('notes__on_canvas');
    expect(keys).toContain('img__staged');
    expect(collectFolderBackedKeys([], [])).toEqual([]);
  });
});

describe('computeUserNoteDisabled', () => {
  it('never blocks the note editor UI', () => {
    expect(computeUserNoteDisabled()).toBe(false);
  });
});

describe('noteRequiresProjectOnlySave', () => {
  it('requires project-only save without folder handle', () => {
    expect(
      noteRequiresProjectOnlySave({
        folderConnected: true,
        folderKeySet: new Set(['notes__a']),
        card: { key: 'notes__a', type: 'user_note', prefix: 'notes' },
      }),
    ).toBe(true);
  });

  it('requires project-only save when key missing from scan set', () => {
    expect(
      noteRequiresProjectOnlySave({
        folderHandle: {},
        folderConnected: true,
        folderKeySet: new Set(['notes__a']),
        card: { key: 'notes__b', type: 'user_note', prefix: 'notes' },
      }),
    ).toBe(true);
  });

  it('uses folder save when folder linked and key present', () => {
    expect(
      noteRequiresProjectOnlySave({
        folderHandle: {},
        folderConnected: true,
        folderKeySet: new Set(['notes__a']),
        card: { key: 'notes__a', type: 'user_note', prefix: 'notes' },
      }),
    ).toBe(false);
  });

  it('uses folder save for nested path when key is in scan set', () => {
    expect(
      noteRequiresProjectOnlySave({
        folderHandle: {},
        folderConnected: true,
        folderKeySet: new Set(['notes/sub/notes__a']),
        card: {
          key: 'notes/sub/notes__a',
          type: 'user_note',
          prefix: 'notes',
          versions: [{ filename: 'notes__a-v1.md', relativePath: 'notes/sub/notes__a-v1.md' }],
        },
      }),
    ).toBe(false);
  });

  it('does not force project-only when folder key set is empty', () => {
    expect(
      noteRequiresProjectOnlySave({
        folderHandle: {},
        folderConnected: true,
        folderKeySet: new Set(),
        card: { key: 'notes__a', type: 'user_note', prefix: 'notes' },
      }),
    ).toBe(false);
  });
});
