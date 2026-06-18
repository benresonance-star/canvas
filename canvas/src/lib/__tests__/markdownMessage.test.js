import { describe, expect, it } from 'vitest';
import {
  markdownViewToggleLabel,
  parseInlineMarkdown,
  parseMarkdownMessage,
} from '../markdownMessage.js';

describe('parseMarkdownMessage', () => {
  it('parses markdown pipe tables', () => {
    const blocks = parseMarkdownMessage([
      '| Item | Purpose | Cost |',
      '| --- | --- | --- |',
      '| Grinder | Make coffee | AUD$15 |',
      '| Filter | Clean water | AUD$30 |',
    ].join('\n'));

    expect(blocks).toEqual([
      {
        type: 'table',
        headers: ['Item', 'Purpose', 'Cost'],
        rows: [
          ['Grinder', 'Make coffee', 'AUD$15'],
          ['Filter', 'Clean water', 'AUD$30'],
        ],
      },
    ]);
  });

  it('parses paragraphs and ordered lists', () => {
    const blocks = parseMarkdownMessage([
      'Shopping list:',
      '',
      '1. **Grinder** tablets',
      '2. `Filter` replacement',
    ].join('\n'));

    expect(blocks).toEqual([
      { type: 'paragraph', text: 'Shopping list:' },
      {
        type: 'list',
        ordered: true,
        start: 1,
        items: ['**Grinder** tablets', '`Filter` replacement'],
      },
    ]);
  });

  it('preserves ordered list start numbers for separated list blocks', () => {
    const blocks = parseMarkdownMessage([
      '1. First item',
      '',
      '- detail',
      '',
      '2. Second item',
    ].join('\n'));

    expect(blocks).toEqual([
      {
        type: 'list',
        ordered: true,
        start: 1,
        items: ['First item'],
      },
      {
        type: 'list',
        ordered: false,
        start: undefined,
        items: ['detail'],
      },
      {
        type: 'list',
        ordered: true,
        start: 2,
        items: ['Second item'],
      },
    ]);
  });
});

describe('parseInlineMarkdown', () => {
  it('parses bold and inline code spans', () => {
    expect(parseInlineMarkdown('Use **fresh beans** and `filtered water`.')).toEqual([
      { type: 'text', text: 'Use ' },
      { type: 'strong', text: 'fresh beans' },
      { type: 'text', text: ' and ' },
      { type: 'code', text: 'filtered water' },
      { type: 'text', text: '.' },
    ]);
  });
});

describe('markdownViewToggleLabel', () => {
  it('shows the destination view label', () => {
    expect(markdownViewToggleLabel(true)).toBe('Plain text');
    expect(markdownViewToggleLabel(false)).toBe('Formatted');
  });
});
