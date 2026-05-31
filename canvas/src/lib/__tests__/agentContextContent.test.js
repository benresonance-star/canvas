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

  it('isContextTypeSupported for text, pdf, and image', () => {
    expect(isContextTypeSupported('markdown')).toBe(true);
    expect(isContextTypeSupported('pdf')).toBe(true);
    expect(isContextTypeSupported('image')).toBe(true);
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
