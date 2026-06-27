import { describe, it, expect } from 'vitest';
import {
  truncateText,
  formatAgentSystemContext,
  formatContextAddMessage,
  formatContextRemoveMessage,
  formatContextAddPreview,
  MINIMAL_AGENT_SYSTEM_CONTEXT,
  applyTotalContextBudget,
  applyContextAddBudget,
  buildContextAddApiContent,
  contextStatusHint,
  isContextTypeSupported,
  dataUrlByteLength,
  CONTEXT_PROFILES,
  getContextLimits,
  loadContextDocumentForCard,
  estimateContextDocument,
} from '../agentContextContent.js';

describe('agentContextContent', () => {
  it('truncateText adds marker when over limit', () => {
    const out = truncateText('a'.repeat(100), 50);
    expect(out.text.length).toBeLessThan(100);
    expect(out.truncated).toBe(true);
    expect(out.text).toContain('[… truncated]');
  });

  it('formatAgentSystemContext includes file bodies', () => {
    const ctx = formatAgentSystemContext('selected', [
      {
        cardId: '1',
        label: 'Doc',
        type: 'markdown',
        status: 'included',
        text: 'Hello world',
      },
    ]);
    expect(ctx).toContain('## Doc (markdown)');
    expect(ctx).toContain('Hello world');
  });

  it('loads markdown context from nested folder-relative paths', async () => {
    const fileHandle = {
      async getFile() {
        return new File(['Nested context body'], 'notes__nested-v1.md', {
          type: 'text/markdown',
        });
      },
    };
    const nestedDir = {
      getFileHandle: async (name) => {
        expect(name).toBe('notes__nested-v1.md');
        return fileHandle;
      },
    };
    const folderHandle = {
      getDirectoryHandle: async (name) => {
        expect(name).toBe('docs');
        return nestedDir;
      },
    };

    const doc = await loadContextDocumentForCard(
      {
        id: 'card-1',
        key: 'docs/notes__nested',
        name: 'Nested',
        type: 'markdown',
        pinnedVersion: 1,
        versions: [{
          version: 1,
          filename: 'notes__nested-v1.md',
          relativePath: 'docs/notes__nested-v1.md',
        }],
      },
      { folderHandle, fetchArtifact: async () => ({ artifact: null }) },
    );

    expect(doc.status).toBe('included');
    expect(doc.text).toContain('Nested context body');
  });

  it('loads code context from nested folder-relative paths', async () => {
    const fileHandle = {
      async getFile() {
        return new File(['export const answer = 42;\n'], 'src__example-v1.ts', {
          type: 'text/typescript',
        });
      },
    };
    const nestedDir = {
      getFileHandle: async (name) => {
        expect(name).toBe('src__example-v1.ts');
        return fileHandle;
      },
    };
    const folderHandle = {
      getDirectoryHandle: async (name) => {
        expect(name).toBe('lib');
        return nestedDir;
      },
    };

    const doc = await loadContextDocumentForCard(
      {
        id: 'card-ts',
        key: 'lib/src__example',
        name: 'example.ts',
        type: 'code',
        pinnedVersion: 1,
        versions: [{
          version: 1,
          filename: 'src__example-v1.ts',
          relativePath: 'lib/src__example-v1.ts',
        }],
      },
      { folderHandle, fetchArtifact: async () => ({ artifact: null }) },
    );

    expect(doc.status).toBe('included');
    expect(doc.type).toBe('code');
    expect(doc.text).toContain('export const answer = 42');
  });

  it('prefers folder text over stale artifact payload when folder is linked', async () => {
    const fileHandle = {
      async getFile() {
        return new File(['Fresh instructions body'], 'general__Instructions-v1.md', {
          type: 'text/markdown',
        });
      },
    };
    const folderHandle = {
      getFileHandle: async () => fileHandle,
    };

    const doc = await loadContextDocumentForCard(
      {
        id: 'instructions',
        name: 'Instructions',
        type: 'markdown',
        pinnedVersion: 1,
        versions: [{
          version: 1,
          filename: 'general__Instructions-v1.md',
          artifactRef: { id: 'artifact-1' },
        }],
      },
      {
        folderHandle,
        fetchArtifact: async () => ({
          artifact: { payload_text: 'Stale instructions body' },
        }),
      },
    );

    expect(doc.status).toBe('included');
    expect(doc.text).toContain('Fresh instructions body');
    expect(doc.text).not.toContain('Stale instructions body');
  });

  it('uses artifact text when folder is not linked', async () => {
    const doc = await loadContextDocumentForCard(
      {
        id: 'instructions',
        name: 'Instructions',
        type: 'markdown',
        pinnedVersion: 1,
        versions: [{
          version: 1,
          filename: 'general__Instructions-v1.md',
          artifactRef: { id: 'artifact-1' },
        }],
      },
      {
        folderHandle: null,
        fetchArtifact: async () => ({
          artifact: { payload_text: 'Artifact-only body' },
        }),
      },
    );

    expect(doc.status).toBe('included');
    expect(doc.text).toBe('Artifact-only body');
  });

  it('falls back to artifact text when folder read fails', async () => {
    const folderHandle = {
      getFileHandle: async () => {
        throw new DOMException('Not found', 'NotFoundError');
      },
    };

    const doc = await loadContextDocumentForCard(
      {
        id: 'instructions',
        name: 'Instructions',
        type: 'markdown',
        pinnedVersion: 1,
        versions: [{
          version: 1,
          filename: 'general__Instructions-v1.md',
          artifactRef: { id: 'artifact-1' },
        }],
      },
      {
        folderHandle,
        fetchArtifact: async () => ({
          artifact: { payload_text: 'Artifact fallback body' },
        }),
      },
    );

    expect(doc.status).toBe('included');
    expect(doc.text).toBe('Artifact fallback body');
  });

  it('estimateContextDocument prefers folder size over stale artifact payload', async () => {
    const fileHandle = {
      async getFile() {
        return new File(['x'.repeat(5000)], 'readme-v1.md', { type: 'text/markdown' });
      },
    };
    const folderHandle = {
      getFileHandle: async () => fileHandle,
    };

    const estimate = await estimateContextDocument(
      {
        id: 'md-1',
        name: 'readme',
        type: 'markdown',
        pinnedVersion: 1,
        versions: [{
          version: 1,
          filename: 'readme-v1.md',
          artifactRef: { id: 'artifact-1' },
        }],
      },
      {
        folderHandle,
        fetchArtifact: async () => ({
          artifact: { payload_text: 'short' },
        }),
      },
    );

    expect(estimate.estimatedChars).toBe(5000);
  });

  it('loads agent chat transcript context from artifact payload text', async () => {
    const doc = await loadContextDocumentForCard(
      {
        id: 'chat-card',
        name: 'Brainstorming Canvas Agentic Systems',
        type: 'agent_chat',
        pinnedVersion: 1,
        versions: [{
          version: 1,
          artifactRef: { type: 'artifact', id: 'artifact-chat' },
        }],
      },
      {
        fetchArtifact: async (id) => {
          expect(id).toBe('artifact-chat');
          return {
            artifact: {
              payload_text: 'User: How could we make this better?\nAssistant: Improve the agent spec.',
            },
          };
        },
      },
    );

    expect(doc.status).toBe('included');
    expect(doc.type).toBe('agent_chat');
    expect(doc.text).toContain('Improve the agent spec.');
  });

  it('falls back to stored agent chat text when artifact payload is empty', async () => {
    const doc = await loadContextDocumentForCard(
      {
        id: 'chat-card',
        name: 'Brainstorming Canvas Agentic Systems',
        type: 'agent_chat',
        pinnedVersion: 1,
        versions: [{
          version: 1,
          artifactRef: { type: 'artifact', id: 'artifact-chat' },
        }],
      },
      {
        fetchArtifact: async () => ({ artifact: { payload_text: '' } }),
        loadAgentChatText: async () => 'Stored transcript body',
      },
    );

    expect(doc.status).toBe('included');
    expect(doc.text).toBe('Stored transcript body');
  });

  it('formatAgentSystemContext notes missing content', () => {
    const ctx = formatAgentSystemContext('selected', [
      {
        cardId: '1',
        label: 'Pic',
        type: 'image',
        status: 'unsupported',
        note: 'not sent',
      },
    ]);
    expect(ctx).toContain('[Content not included: not sent]');
  });

  it('formatAgentSystemContext describes attached images', () => {
    const ctx = formatAgentSystemContext('selected', [
      {
        cardId: '1',
        label: 'Facade',
        type: 'image',
        status: 'included',
        text: 'Image file (~120 KB).',
        imageDataUrl: 'data:image/png;base64,abc',
      },
    ]);
    expect(ctx).toContain('Facade');
    expect(ctx).toContain('[Image attached — sent as vision input');
  });

  it('buildContextAddApiContent includes text and image_url parts', () => {
    const parts = buildContextAddApiContent('selected', [
      {
        cardId: '1',
        label: 'Photo',
        type: 'image',
        status: 'included',
        text: 'Image file (~1 KB).',
        imageDataUrl: 'data:image/png;base64,abcd',
        imageDetail: 'low',
      },
    ]);
    expect(parts[0].type).toBe('text');
    expect(parts.some((p) => p.type === 'image_url')).toBe(true);
    expect(parts.find((p) => p.type === 'image_url').image_url.url).toContain('data:image');
  });

  it('applyContextAddBudget limits image count', () => {
    const makeImg = (id) => ({
      cardId: id,
      label: id,
      type: 'image',
      status: 'included',
      imageDataUrl: 'data:image/png;base64,aaaa',
      imageBytes: 3,
      text: 'meta',
    });
    const docs = applyContextAddBudget(
      [makeImg('1'), makeImg('2'), makeImg('3'), makeImg('4'), makeImg('5'), makeImg('6')],
      'standard',
    );
    const errors = docs.filter((d) => d.status === 'error');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('applyTotalContextBudget trims with extended profile', () => {
    const limits = getContextLimits('extended');
    const docs = applyTotalContextBudget(
      [
        {
          cardId: '1',
          label: 'A',
          type: 'markdown',
          status: 'included',
          text: 'x'.repeat(limits.maxTotalChars - 100),
        },
        {
          cardId: '2',
          label: 'B',
          type: 'markdown',
          status: 'included',
          text: 'y'.repeat(500),
        },
      ],
      'extended',
    );
    expect(docs[0].text.length).toBeGreaterThan(0);
    expect(docs[1].text.length).toBeLessThan(500);
    expect(docs[1].truncated).toBe(true);
  });

  it('contextStatusHint marks pdf without folder', () => {
    const hint = contextStatusHint(
      { id: 'c1', name: 'Spec', type: 'pdf', versions: [{ version: 1, filename: 'a.pdf' }] },
      { folderLinked: false },
    );
    expect(hint.status).toBe('needs_folder');
  });

  it('isContextTypeSupported for text, pdf, image, flow, live, and code', () => {
    expect(isContextTypeSupported('markdown')).toBe(true);
    expect(isContextTypeSupported('pdf')).toBe(true);
    expect(isContextTypeSupported('image')).toBe(true);
    expect(isContextTypeSupported('flow')).toBe(true);
    expect(isContextTypeSupported('live')).toBe(true);
    expect(isContextTypeSupported('code')).toBe(true);
  });

  it('contextStatusHint marks code cards as pending when folder file exists', () => {
    const hint = contextStatusHint(
      {
        id: 'c1',
        name: 'example.ts',
        type: 'code',
        versions: [{ version: 1, filename: 'src__example-v1.ts' }],
      },
      { folderLinked: true },
    );
    expect(hint.status).toBe('pending');
  });

  it('contextStatusHint marks code cards as needs_folder without folder or artifact', () => {
    const hint = contextStatusHint(
      {
        id: 'c1',
        name: 'agent.ts',
        type: 'code',
        versions: [{ version: 1, filename: 'models__agent-v1.ts' }],
      },
      { folderLinked: false },
    );
    expect(hint.status).toBe('needs_folder');
  });

  it('loadContextDocumentForCard uses pinned.content when artifact and folder are unavailable', async () => {
    const doc = await loadContextDocumentForCard(
      {
        id: 'card-ts',
        name: 'agent.ts',
        type: 'code',
        pinnedVersion: 1,
        versions: [{
          version: 1,
          filename: 'models__agent-v1.ts',
          content: 'model: "openai/gpt-5.5"',
        }],
      },
      {
        folderHandle: null,
        fetchArtifact: async () => ({ artifact: null }),
      },
    );

    expect(doc.status).toBe('included');
    expect(doc.text).toBe('model: "openai/gpt-5.5"');
  });

  it('loadContextDocumentForCard loads flow via injected loader', async () => {
    const doc = await loadContextDocumentForCard(
      {
        id: 'flow-card',
        name: 'Onboarding',
        type: 'flow',
        pinnedVersion: 1,
        versions: [{ version: 1, flowId: 'flow-1' }],
      },
      {
        loadFlowContextText: async () => '# Exploration: Onboarding\n\n## Nodes',
      },
    );
    expect(doc.status).toBe('included');
    expect(doc.text).toContain('Exploration: Onboarding');
  });

  it('contextStatusHint marks live cards as pending when liveArtifactId exists', () => {
    const hint = contextStatusHint(
      {
        id: 'live-1',
        name: 'Project feed',
        type: 'live',
        liveArtifactId: 'artifact-live-1',
        pinnedVersion: 1,
        versions: [{ version: 1, liveArtifactId: 'artifact-live-1' }],
      },
      { folderLinked: false },
    );
    expect(hint.status).toBe('pending');
  });

  it('loadContextDocumentForCard loads live feed via injected loader', async () => {
    const doc = await loadContextDocumentForCard(
      {
        id: 'live-card',
        name: 'Weekly update',
        type: 'live',
        liveArtifactId: 'live-artifact-1',
        pinnedVersion: 1,
        versions: [{ version: 1, liveArtifactId: 'live-artifact-1' }],
      },
      {
        loadLiveContextText: async () => '# Live Agent Feed: Weekly update\n\nBody text',
      },
    );
    expect(doc.status).toBe('included');
    expect(doc.text).toContain('Weekly update');
    expect(doc.text).toContain('Body text');
  });

  it('loadContextDocumentForCard returns empty when live loader has no report', async () => {
    const doc = await loadContextDocumentForCard(
      {
        id: 'live-card',
        name: 'Weekly update',
        type: 'live',
        liveArtifactId: 'live-artifact-1',
        pinnedVersion: 1,
        versions: [{ version: 1, liveArtifactId: 'live-artifact-1' }],
      },
      {
        loadLiveContextText: async () => null,
      },
    );
    expect(doc.status).toBe('empty');
  });

  it('dataUrlByteLength estimates base64 payload size', () => {
    expect(dataUrlByteLength('data:image/png;base64,AAAA')).toBeGreaterThan(0);
  });

  it('contextStatusHint marks image without folder or preview', () => {
    const hint = contextStatusHint(
      {
        id: 'c1',
        name: 'Photo',
        type: 'image',
        versions: [{ version: 1, filename: 'photo.png' }],
      },
      { folderLinked: false },
    );
    expect(hint.status).toBe('needs_folder');
  });

  it('formatContextAddMessage wraps file bodies for user history', () => {
    const msg = formatContextAddMessage('selected', [
      {
        cardId: '1',
        label: 'Doc',
        type: 'markdown',
        status: 'included',
        text: 'Body text',
      },
    ]);
    expect(msg).toContain('Canvas context');
    expect(msg).toContain('Body text');
  });

  it('formatContextRemoveMessage lists removed labels', () => {
    const msg = formatContextRemoveMessage([{ label: 'Spec.pdf' }]);
    expect(msg).toContain('removed from context');
    expect(msg).toContain('Spec.pdf');
  });

  it('formatContextAddPreview truncates long excerpts', () => {
    const preview = formatContextAddPreview(
      [
        {
          cardId: '1',
          label: 'Long',
          type: 'markdown',
          status: 'included',
          text: 'word '.repeat(200),
        },
      ],
      50,
    );
    expect(preview).toContain('Long:');
    expect(preview.length).toBeLessThan(400);
  });

  it('formatContextAddPreview marks images', () => {
    const preview = formatContextAddPreview([
      {
        cardId: '1',
        label: 'Photo',
        type: 'image',
        status: 'included',
        imageDataUrl: 'data:image/png;base64,x',
      },
    ]);
    expect(preview).toContain('[image attached]');
  });

  it('MINIMAL_AGENT_SYSTEM_CONTEXT has no file sections', () => {
    expect(MINIMAL_AGENT_SYSTEM_CONTEXT).toContain('Canvas');
    expect(MINIMAL_AGENT_SYSTEM_CONTEXT).not.toContain('##');
  });

  it('extended profile has higher limits than standard', () => {
    expect(CONTEXT_PROFILES.extended.maxTotalChars).toBeGreaterThan(
      CONTEXT_PROFILES.standard.maxTotalChars,
    );
    expect(CONTEXT_PROFILES.extended.pdfMaxPages).toBeGreaterThan(
      CONTEXT_PROFILES.standard.pdfMaxPages,
    );
  });
});
