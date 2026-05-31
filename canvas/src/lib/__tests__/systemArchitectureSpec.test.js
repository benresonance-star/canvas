import { describe, it, expect } from 'vitest';
import {
  ARCHITECTURE_SPEC_VERSION,
  ARCHITECTURE_ENTITY_STORAGE,
  buildArchitectureMarkdown,
  buildArchitectureMermaid,
} from '../systemArchitectureSpec.js';

describe('systemArchitectureSpec', () => {
  it('buildArchitectureMarkdown includes spec version and sync section', () => {
    const md = buildArchitectureMarkdown();
    expect(md).toContain(ARCHITECTURE_SPEC_VERSION);
    expect(md).toContain('## Code layout (client sync)');
    expect(md).toContain('lib/sync');
    expect(md).toContain('syncStaging');
    expect(md).toContain('## Placement model (current)');
    expect(md).toContain('artifactPlacement');
    expect(md).toContain('## Sync model (current)');
    expect(md).toContain('SYNC dialog is not for placement');
    expect(md).toContain('revision');
    expect(md).toContain('reconcileActiveProject');
    expect(md).toContain('## User notes (current)');
    expect(md).toContain('spec_canvas_state');
    expect(md).toContain('```mermaid');
    expect(md).toContain('## Load performance roadmap');
  });

  it('documents entity storage for projects, graph, and agent chat', () => {
    const ids = ARCHITECTURE_ENTITY_STORAGE.map((e) => e.id);
    expect(ids).toContain('projects');
    expect(ids).toContain('clusters');
    expect(ids).toContain('artifacts');
    expect(ids).toContain('primitives');
    expect(ids).toContain('notes');
    expect(ids).toContain('urls');
    expect(ids).toContain('agent-chats');
    expect(ids).toContain('sync-dock');

    const md = buildArchitectureMarkdown();
    expect(md).toContain('## Entity storage');
    expect(md).toContain('canvas_project_document');
    expect(md).toContain('artifactPlacements');
    expect(md).toContain('stageAgentChatCard');
    expect(md).toContain('canvas-previews');
  });

  it('buildArchitectureMarkdown includes runtime when provided', () => {
    const md = buildArchitectureMarkdown({
      generatedAt: '2026-05-30T12:00:00.000Z',
      syncMode: 'server',
      serverSyncEnabled: true,
      activeProjectId: 'proj-1',
      syncLock: 'live',
      clientRevision: 5,
      cardCount: 12,
      folderLinked: true,
      folderLinkPhase: 'linked',
    });
    expect(md).toContain('## Runtime snapshot');
    expect(md).toContain('folderLinkPhase: linked');
    expect(md).toContain('syncLock: live');
    expect(md).toContain('syncMode: server');
    expect(md).toContain('clientRevision: 5');
  });

  it('buildArchitectureMermaid is non-empty flowchart', () => {
    const m = buildArchitectureMermaid();
    expect(m).toContain('flowchart');
    expect(m).toContain('artifactPlacement');
    expect(m).toContain('syncStaging');
    expect(m).toContain('lib_sync_projectSync');
    expect(m).toContain('reconcileActiveProject');
    expect(m).toContain('spec_canvas_state');
    expect(m.length).toBeGreaterThan(40);
  });

  it('documents folder sync identity and bookmark editing features', () => {
    const md = buildArchitectureMarkdown();
    expect(md).toContain('Folder sync identity (SYNC dialog)');
    expect(md).toContain('buildConfirmChangesForDialog');
    expect(md).toContain('Bookmark / link editing');
    expect(md).toContain('saveBookmarkToProject');
  });
});
