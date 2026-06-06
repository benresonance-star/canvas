import { describe, it, expect } from 'vitest';
import {
  formatAgentChatTranscript,
  parseAgentChatTranscript,
  buildAgentChatFilename,
} from '../agentChatArtifact.js';

describe('agentChatArtifact', () => {
  it('buildAgentChatFilename uses legacy name without thread slug', () => {
    expect(buildAgentChatFilename('openai', 'legacy')).toBe('notes__agent-chat-openai-v1.md');
  });

  it('buildAgentChatFilename includes thread slug for new threads', () => {
    expect(buildAgentChatFilename('openai', 'abcd1234-5678-90ab-cdef-1234567890ab')).toBe(
      'notes__agent-chat-openai-abcd1234-v1.md',
    );
  });

  it('formatAgentChatTranscript includes thread title when provided', () => {
    const md = formatAgentChatTranscript([], {
      projectName: 'P',
      connectorId: 'openai',
      threadId: 't1',
      title: 'Design review',
    });
    expect(md).toContain('**Thread:** Design review');
  });

  it('formatAgentChatTranscript summarizes context without full bodies', () => {
    const md = formatAgentChatTranscript(
      [
        { role: 'user', content: 'Question?', at: Date.UTC(2026, 4, 29, 12, 0, 0) },
        {
          kind: 'context_add',
          labels: ['spec.pdf'],
          content: '[Canvas context — huge body omitted in artifact]',
          at: Date.UTC(2026, 4, 29, 12, 0, 1),
        },
        { role: 'assistant', content: 'Answer.', at: Date.UTC(2026, 4, 29, 12, 0, 2) },
      ],
      { projectName: 'Test', connectorId: 'openai', connectorLabel: 'ChatGPT' },
    );
    expect(md).toContain('# Agent chat transcript');
    expect(md).toContain('ChatGPT');
    expect(md).toContain('Question?');
    expect(md).toContain('Context: sent to AI — spec.pdf');
    expect(md).not.toContain('huge body omitted');
    expect(md).toContain('Answer.');
  });

  it('parseAgentChatTranscript round-trips conversation messages', () => {
    const original = [
      { id: 'u1', role: 'user', content: 'Hello', at: Date.UTC(2026, 4, 29, 12, 0, 0) },
      {
        id: 'a1',
        role: 'assistant',
        content: 'Hi there',
        at: Date.UTC(2026, 4, 29, 12, 0, 5),
      },
    ];
    const md = formatAgentChatTranscript(original, {
      projectName: 'P',
      connectorId: 'openai',
      threadId: 'abcd1234-5678-90ab-cdef-1234567890ab',
      title: 'Test',
    });
    const parsed = parseAgentChatTranscript(md);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].role).toBe('user');
    expect(parsed[0].content).toBe('Hello');
    expect(parsed[1].role).toBe('assistant');
    expect(parsed[1].content).toBe('Hi there');
  });

  it('parseAgentChatTranscript preserves assistant paragraphs and lists', () => {
    const md = formatAgentChatTranscript(
      [
        {
          id: 'u1',
          role: 'user',
          content: 'What lessons can we learn?',
          at: Date.UTC(2026, 4, 29, 12, 0, 0),
        },
        {
          id: 'a1',
          role: 'assistant',
          content: [
            'Based on the content from two documents, here are some lessons.',
            '',
            '1. **Classification by Behavior:** Group data structures by behavior.',
            '',
            '2. **Separation of Concerns:** Keep logic separate from storage.',
            '',
            '8. **Governance and Budgeting:** Track complexity and resource usage.',
          ].join('\n'),
          at: Date.UTC(2026, 4, 29, 12, 0, 5),
        },
      ],
      {
        projectName: 'P',
        connectorId: 'openai',
        threadId: 'dbfadeb5-3a5e-4c26-baa8-694ada8eae45',
        title: 'Data Structures',
      },
    );
    const parsed = parseAgentChatTranscript(md);
    expect(parsed).toHaveLength(2);
    expect(parsed[1].role).toBe('assistant');
    expect(parsed[1].content).toContain('1. **Classification by Behavior:**');
    expect(parsed[1].content).toContain('8. **Governance and Budgeting:**');
  });

  it('parseAgentChatTranscript restores context events', () => {
    const md = formatAgentChatTranscript(
      [
        {
          id: 'c1',
          kind: 'context_add',
          labels: ['a.pdf'],
          at: Date.UTC(2026, 4, 29, 12, 0, 0),
        },
      ],
      { projectName: 'P', connectorId: 'openai' },
    );
    const parsed = parseAgentChatTranscript(md);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].kind).toBe('context_add');
    expect(parsed[0].labels).toEqual(['a.pdf']);
  });
});
