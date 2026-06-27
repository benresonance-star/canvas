import { describe, expect, it } from 'vitest';
import {
  flowPreviewColors,
  flowPreviewNodePresentation,
  flowPreviewNodeTitle,
  flowPreviewNodeTypeId,
} from '../flowPreviewNodes.js';

describe('flowPreviewNodes', () => {
  it('flowPreviewNodeTypeId maps artifact nodes to artifact type', () => {
    expect(flowPreviewNodeTypeId({ type: 'artifact' })).toBe('artifact');
    expect(flowPreviewNodeTypeId({ type: 'local', localNodeType: 'decision' })).toBe('decision');
  });

  it('flowPreviewNodePresentation uses configured colors', () => {
    const presentation = flowPreviewNodePresentation(
      { type: 'local', localNodeType: 'decision' },
      { decision: '#123456' },
    );
    expect(presentation.headerColor).toBe('#123456');
    expect(presentation.typeLabel).toBe('DECISION');
  });

  it('flowPreviewColors falls back to defaults', () => {
    expect(flowPreviewColors(null).artifact).toBe('#2563eb');
  });

  it('flowPreviewNodeTitle uses artifact filename and local titles', () => {
    expect(flowPreviewNodeTitle({ type: 'local', title: 'Kickoff' })).toBe('Kickoff');
    expect(flowPreviewNodeTitle({
      type: 'artifact',
      displayFilename: 'agent.ts',
    })).toBe('agent.ts');
  });
});
