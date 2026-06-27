import { describe, expect, it } from 'vitest';
import {
  markdownViewToggleLabel,
  normalizeAgentMarkdownContent,
  parseInlineMarkdown,
  parseMarkdownMessage,
  resolveLatexSymbol,
  resolveMarkdownCopyText,
  serializeInlineMarkdownText,
  serializeMarkdownMessage,
  domInlineToMarkdown,
  inlineMarkdownToHtml,
  buildEditableInlineHtml,
  buildEditableDocumentHtml,
  editableDocumentToBlocks,
  editableDocumentToMarkdown,
  splitMixedBlockNode,
  applyEditableListClasses,
  paragraphToListBlock,
  setListBlockOrdered,
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

  it('parses headings and indented list continuation lines', () => {
    const blocks = parseMarkdownMessage([
      '### Espresso Setup for Quality Extraction',
      '',
      '1. **Espresso Machine**',
      '   - *Description:* Stable pressure and temperature.',
      '2. **Coffee Grinder**',
      '   - *Description:* Uniform grind size.',
    ].join('\n'));

    expect(blocks).toEqual([
      {
        type: 'heading',
        level: 3,
        text: 'Espresso Setup for Quality Extraction',
      },
      {
        type: 'list',
        ordered: true,
        start: 1,
        items: [
          '**Espresso Machine**\n*Description:* Stable pressure and temperature.',
          '**Coffee Grinder**\n*Description:* Uniform grind size.',
        ],
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

describe('resolveLatexSymbol', () => {
  it('maps common LaTeX descriptors to Unicode symbols', () => {
    expect(resolveLatexSymbol('$\\rightarrow$')).toBe('→');
    expect(resolveLatexSymbol('\\Rightarrow')).toBe('⇒');
    expect(resolveLatexSymbol('$\\geq$')).toBe('≥');
  });
});

describe('normalizeAgentMarkdownContent', () => {
  it('rewrites dollar-delimited flow descriptors before markdown parsing', () => {
    const input = '`Instructions` (Intent) $\\rightarrow$ `Rules` (Constraints) $\\rightarrow$ `Agent` (Execution).';
    expect(normalizeAgentMarkdownContent(input)).toBe(
      '`Instructions` (Intent) → `Rules` (Constraints) → `Agent` (Execution).',
    );
  });

  it('repairs carriage-return corrupted latex from bad JSON escapes', () => {
    const corrupted = 'If Instructions $' + '\r' + 'ightarrow$ Rules is driven by Machines';
    expect(normalizeAgentMarkdownContent(corrupted)).toBe(
      'If Instructions → Rules is driven by Machines',
    );
  });

  it('rewrites latex inside a single monolithic inline code span', () => {
    const input = 'a clear pipeline: `Instructions (Intent) $\\rightarrow$ Rules (Constraints) $\\rightarrow$ Agent (Execution)`.';
    expect(normalizeAgentMarkdownContent(input)).toBe(
      'a clear pipeline: `Instructions (Intent) → Rules (Constraints) → Agent (Execution)`.',
    );
  });

  it('normalizes full governance-layer agent replies end-to-end', () => {
    const blocks = parseMarkdownMessage([
      '1. **The Governance Layer (The "Constitution")**',
      'You have created a clear pipeline: `Instructions` (Intent) $\\rightarrow$ `Rules` (Constraints) $\\rightarrow$ `Agent` (Execution).',
      '',
      '* If `Instructions` $\\rightarrow$ `Rules` is driven by Machines (Logic/Structure),',
      '* If `Rules` $\\rightarrow$ `agent` is driven by Grace (Tone/Compassion),',
    ].join('\n'));
    const rendered = blocks.flatMap((block) => {
      if (block.type === 'list') {
        return block.items.flatMap((item) => parseInlineMarkdown(item));
      }
      return parseInlineMarkdown(block.text ?? '');
    });
    const combined = rendered.map((segment) => segment.text ?? '').join('');
    expect(combined.includes('$\\rightarrow$')).toBe(false);
    expect((combined.match(/→/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});

describe('parseInlineMarkdown', () => {
  it('renders bare URLs and markdown links as link segments', () => {
    expect(parseInlineMarkdown('See https://www.theurbandeveloper.com/ for updates.')).toEqual([
      { type: 'text', text: 'See ' },
      { type: 'link', text: 'https://www.theurbandeveloper.com/', href: 'https://www.theurbandeveloper.com/' },
      { type: 'text', text: ' for updates.' },
    ]);
    expect(parseInlineMarkdown('Read [Urban Developer](https://www.theurbandeveloper.com/) today.')).toEqual([
      { type: 'text', text: 'Read ' },
      { type: 'link', text: 'Urban Developer', href: 'https://www.theurbandeveloper.com/' },
      { type: 'text', text: ' today.' },
    ]);
  });

  it('parses bold and inline code spans', () => {
    expect(parseInlineMarkdown('Use **fresh beans**, *RDT*, and `filtered water`.')).toEqual([
      { type: 'text', text: 'Use ' },
      { type: 'strong', text: 'fresh beans' },
      { type: 'text', text: ', ' },
      { type: 'emphasis', text: 'RDT' },
      { type: 'text', text: ', and ' },
      { type: 'code', text: 'filtered water' },
      { type: 'text', text: '.' },
    ]);
  });

  it('renders LaTeX flow descriptors between inline code spans', () => {
    expect(parseInlineMarkdown('`skills-grilling` $\\rightarrow$ `tools-python`')).toEqual([
      { type: 'code', text: 'skills-grilling' },
      { type: 'text', text: ' → ' },
      { type: 'code', text: 'tools-python' },
    ]);
  });

  it('renders LaTeX descriptors wrapped in inline code', () => {
    expect(parseInlineMarkdown('`skills-grilling` `\\rightarrow` `tools-python`')).toEqual([
      { type: 'code', text: 'skills-grilling' },
      { type: 'text', text: ' → ' },
      { type: 'code', text: 'tools-python' },
    ]);
  });

  it('renders bare LaTeX flow descriptors without dollar delimiters', () => {
    expect(parseInlineMarkdown('`Instructions` \\rightarrow `Rules`')).toEqual([
      { type: 'code', text: 'Instructions' },
      { type: 'text', text: ' → ' },
      { type: 'code', text: 'Rules' },
    ]);
  });

  it('renders governance-layer agent pipeline descriptors', () => {
    expect(parseInlineMarkdown(
      '`Instructions` (Intent) $\\rightarrow$ `Rules` (Constraints) $\\rightarrow$ `Agent` (Execution).',
    )).toEqual([
      { type: 'code', text: 'Instructions' },
      { type: 'text', text: ' (Intent) → ' },
      { type: 'code', text: 'Rules' },
      { type: 'text', text: ' (Constraints) → ' },
      { type: 'code', text: 'Agent' },
      { type: 'text', text: ' (Execution).' },
    ]);
  });

  it('renders latex inside a monolithic inline code span', () => {
    const input = 'a clear pipeline: `Instructions (Intent) $\\rightarrow$ Rules (Constraints) $\\rightarrow$ Agent (Execution)`.';
    const segments = parseInlineMarkdown(input);
    const combined = segments.map((segment) => segment.text ?? '').join('');
    expect(combined.includes('$\\rightarrow$')).toBe(false);
    expect((combined.match(/→/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(segments).toEqual([
      { type: 'text', text: 'a clear pipeline: ' },
      {
        type: 'code',
        text: 'Instructions (Intent) → Rules (Constraints) → Agent (Execution)',
      },
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

describe('resolveMarkdownCopyText', () => {
  it('returns null for empty selection', () => {
    expect(resolveMarkdownCopyText('', 'Hello world')).toBeNull();
    expect(resolveMarkdownCopyText('   ', 'Hello world')).toBeNull();
  });

  it('returns null for partial selection so browser copies visible text', () => {
    expect(resolveMarkdownCopyText('Hello', 'Hello world')).toBeNull();
    expect(resolveMarkdownCopyText('world', 'Hello world')).toBeNull();
  });

  it('returns raw markdown when the full message is selected', () => {
    const content = '**Bold** and `code`';
    expect(resolveMarkdownCopyText(content, content)).toBe(content);
    expect(resolveMarkdownCopyText(`  ${content}  `, content)).toBe(content);
  });
});

describe('serializeMarkdownMessage', () => {
  it('serializes inline emphasis and code', () => {
    expect(serializeInlineMarkdownText('Use **fresh beans** and `water`.')).toBe(
      'Use **fresh beans** and `water`.',
    );
  });

  it('serializes paragraphs, headings, lists, and tables', () => {
    const blocks = parseMarkdownMessage([
      '### Title',
      '',
      'Intro paragraph',
      '',
      '- one',
      '- two',
      '',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
    ].join('\n'));

    const serialized = serializeMarkdownMessage(blocks);
    expect(serialized).toContain('### Title');
    expect(serialized).toContain('Intro paragraph');
    expect(serialized).toContain('- one\n- two');
    expect(serialized).toContain('| A | B |');
    expect(serialized).toContain('| 1 | 2 |');
    expect(parseMarkdownMessage(serialized)).toEqual(blocks);
  });

  it('round-trips a mixed document through parse and serialize', () => {
    const source = [
      'Shopping list:',
      '',
      '1. **Grinder** tablets',
      '2. `Filter` replacement',
      '',
      '| Item | Cost |',
      '| --- | --- |',
      '| Grinder | AUD$15 |',
    ].join('\n');

    const once = serializeMarkdownMessage(parseMarkdownMessage(source));
    const twice = serializeMarkdownMessage(parseMarkdownMessage(once));
    expect(twice).toBe(once);
    expect(parseMarkdownMessage(once)).toEqual(parseMarkdownMessage(source));
  });

  it('round-trips headings with nested list continuations', () => {
    const source = [
      '### Espresso Setup',
      '',
      '1. **Espresso Machine**',
      '   - *Description:* Stable pressure.',
      '2. **Grinder**',
      '   - *Description:* Uniform grind.',
    ].join('\n');

    const serialized = serializeMarkdownMessage(parseMarkdownMessage(source));
    expect(parseMarkdownMessage(serialized)).toEqual(parseMarkdownMessage(source));
  });
});

describe('paragraphToListBlock', () => {
  it('converts a paragraph into a bullet list', () => {
    const list = paragraphToListBlock({ type: 'paragraph', text: 'one\ntwo' }, false);
    expect(list).toEqual({
      type: 'list',
      ordered: false,
      items: ['one', 'two'],
    });
    expect(serializeMarkdownMessage([list])).toBe('- one\n- two');
  });

  it('converts a paragraph into a numbered list', () => {
    const list = paragraphToListBlock({ type: 'paragraph', text: 'first' }, true);
    expect(list).toEqual({
      type: 'list',
      ordered: true,
      start: 1,
      items: ['first'],
    });
    expect(serializeMarkdownMessage([list])).toBe('1. first');
  });

  it('creates one empty item for blank paragraphs', () => {
    const list = paragraphToListBlock({ type: 'paragraph', text: '' }, false);
    expect(list.items).toEqual(['']);
  });
});

describe('setListBlockOrdered', () => {
  it('switches bullet list to ordered', () => {
    const bullet = {
      type: 'list',
      ordered: false,
      items: ['alpha', 'beta'],
    };
    const ordered = setListBlockOrdered(bullet, true);
    expect(ordered.ordered).toBe(true);
    expect(ordered.start).toBe(1);
    expect(serializeMarkdownMessage([ordered])).toBe('1. alpha\n2. beta');
  });

  it('switches ordered list to bullet', () => {
    const ordered = {
      type: 'list',
      ordered: true,
      start: 1,
      items: ['alpha'],
    };
    const bullet = setListBlockOrdered(ordered, false);
    expect(bullet.ordered).toBe(false);
    expect(bullet.start).toBeUndefined();
    expect(serializeMarkdownMessage([bullet])).toBe('- alpha');
  });
});

describe('buildEditableDocumentHtml', () => {
  const TEXT_NODE = 3;
  const ELEMENT_NODE = 1;

  function mockText(text) {
    return { nodeType: TEXT_NODE, textContent: text, childNodes: [] };
  }

  function mockElement(tag, { childNodes = [], attrs = {} } = {}) {
    return {
      nodeType: ELEMENT_NODE,
      tagName: tag.toUpperCase(),
      childNodes,
      children: childNodes,
      getAttribute: (name) => attrs[name] ?? null,
      querySelectorAll: (selector) => {
        if (selector === 'thead tr th, thead tr td') {
          const thead = childNodes.find((node) => node.tagName === 'THEAD');
          const row = thead?.childNodes?.find((node) => node.tagName === 'TR');
          return row?.childNodes ?? [];
        }
        if (selector === 'tbody tr') {
          const tbody = childNodes.find((node) => node.tagName === 'TBODY');
          return tbody?.childNodes ?? [];
        }
        if (selector === 'td, th') {
          return childNodes;
        }
        return [];
      },
    };
  }

  function mockDocumentRoot(blocks) {
    return mockElement('div', { childNodes: blocks });
  }

  it('renders paragraphs, lists, and headings as one document', () => {
    const blocks = parseMarkdownMessage([
      'Intro paragraph',
      '',
      '- one',
      '- two',
      '',
      '### Title',
    ].join('\n'));
    const html = buildEditableDocumentHtml(blocks);
    expect(html).toContain('<p class="whitespace-pre-wrap">Intro paragraph</p>');
    expect(html).toContain('<ul class="list-disc');
    expect(html).toContain('<li class="whitespace-pre-wrap">one</li>');
    expect(html).toContain('<li class="whitespace-pre-wrap">two</li>');
    expect(html).toContain('<h3 class="font-semibold text-primary');
  });

  it('renders an empty document with a caret placeholder paragraph', () => {
    expect(buildEditableDocumentHtml([])).toBe('<p class="whitespace-pre-wrap"><br></p>');
  });

  it('round-trips a multi-paragraph note through document html', () => {
    const source = [
      'First paragraph.',
      '',
      'Second paragraph with **bold**.',
      '',
      '- alpha',
      '- beta',
      '- gamma',
      '- delta',
    ].join('\n');
    const blocks = parseMarkdownMessage(source);
    const html = buildEditableDocumentHtml(blocks);
    const listNode = mockElement('ul', {
      childNodes: [
        mockElement('li', { childNodes: [mockText('alpha')] }),
        mockElement('li', { childNodes: [mockText('beta')] }),
        mockElement('li', { childNodes: [mockText('gamma')] }),
        mockElement('li', { childNodes: [mockText('delta')] }),
      ],
    });
    const root = mockDocumentRoot([
      mockElement('p', { childNodes: [mockText('First paragraph.')] }),
      mockElement('p', {
        childNodes: [
          mockText('Second paragraph with '),
          mockElement('strong', { childNodes: [mockText('bold')] }),
          mockText('.'),
        ],
      }),
      listNode,
    ]);
    expect(html).toContain('>alpha</li>');
    expect(editableDocumentToMarkdown(root)).toBe(serializeMarkdownMessage(blocks));
  });

  it('round-trips ordered lists with continuous numbering', () => {
    const blocks = parseMarkdownMessage('1. first\n2. second\n3. third\n4. fourth');
    const root = mockDocumentRoot([
      mockElement('ol', {
        attrs: { start: '1' },
        childNodes: [
          mockElement('li', { childNodes: [mockText('first')] }),
          mockElement('li', { childNodes: [mockText('second')] }),
          mockElement('li', { childNodes: [mockText('third')] }),
          mockElement('li', { childNodes: [mockText('fourth')] }),
        ],
      }),
    ]);
    expect(editableDocumentToMarkdown(root)).toBe(serializeMarkdownMessage(blocks));
    expect(editableDocumentToBlocks(root)).toEqual([
      {
        type: 'list',
        ordered: true,
        start: 1,
        items: ['first', 'second', 'third', 'fourth'],
      },
    ]);
  });

  it('round-trips bold and italic inside list items', () => {
    const blocks = parseMarkdownMessage('- **bold** and *italic*');
    const root = mockDocumentRoot([
      mockElement('ul', {
        childNodes: [
          mockElement('li', {
            childNodes: [
              mockElement('strong', { childNodes: [mockText('bold')] }),
              mockText(' and '),
              mockElement('em', { childNodes: [mockText('italic')] }),
            ],
          }),
        ],
      }),
    ]);
    expect(editableDocumentToMarkdown(root)).toBe(serializeMarkdownMessage(blocks));
  });

  it('merges adjacent lists of the same type', () => {
    const root = mockDocumentRoot([
      mockElement('ul', {
        childNodes: [mockElement('li', { childNodes: [mockText('one')] })],
      }),
      mockElement('ul', {
        childNodes: [mockElement('li', { childNodes: [mockText('two')] })],
      }),
    ]);
    expect(editableDocumentToBlocks(root)).toEqual([
      { type: 'list', ordered: false, items: ['one', 'two'] },
    ]);
  });

  it('splits nested list inside paragraph via splitMixedBlockNode', () => {
    const nestedList = mockElement('ul', {
      childNodes: [
        mockElement('li', { childNodes: [mockText('First principles thinking')] }),
        mockElement('li', { childNodes: [mockText('critical thinking')] }),
      ],
    });
    const corruptedParagraph = mockElement('p', {
      childNodes: [mockText('You provide:'), nestedList],
    });

    expect(splitMixedBlockNode(corruptedParagraph)).toEqual([
      { type: 'paragraph', text: 'You provide:' },
      {
        type: 'list',
        ordered: false,
        items: ['First principles thinking', 'critical thinking'],
      },
    ]);
  });

  it('recovers Instructions-style paragraph plus bullet list from nested-ul-in-p DOM', () => {
    const source = [
      'You provide:',
      '',
      '- First principles thinking',
      '- critical thinking',
      '- critical analysis',
    ].join('\n');
    const blocks = parseMarkdownMessage(source);
    const nestedList = mockElement('ul', {
      childNodes: [
        mockElement('li', { childNodes: [mockText('First principles thinking')] }),
        mockElement('li', { childNodes: [mockText('critical thinking')] }),
        mockElement('li', { childNodes: [mockText('critical analysis')] }),
      ],
    });
    const root = mockDocumentRoot([
      mockElement('p', {
        childNodes: [mockText('You provide:'), nestedList],
      }),
    ]);

    expect(editableDocumentToMarkdown(root)).toBe(serializeMarkdownMessage(blocks));
    expect(editableDocumentToMarkdown(root)).not.toContain('thinkingcritical');
  });

  it('does not glue multiple paragraph children inside one list item', () => {
    const root = mockDocumentRoot([
      mockElement('ul', {
        childNodes: [
          mockElement('li', {
            childNodes: [
              mockElement('p', { childNodes: [mockText('First principles thinking')] }),
              mockElement('p', { childNodes: [mockText('critical thinking')] }),
            ],
          }),
        ],
      }),
    ]);

    const markdown = editableDocumentToMarkdown(root);
    expect(markdown).not.toBe('- First principles thinkingcritical thinking');
    expect(markdown).toContain('First principles thinking');
    expect(markdown).toContain('critical thinking');
  });
});

describe('applyEditableListClasses', () => {
  it('adds list marker classes to bare execCommand lists when document is available', () => {
    if (typeof document === 'undefined') return;

    const root = document.createElement('div');
    const ul = document.createElement('ul');
    const li = document.createElement('li');
    li.textContent = 'item one';
    ul.appendChild(li);
    root.appendChild(ul);

    applyEditableListClasses(root);

    expect(ul.classList.contains('list-disc')).toBe(true);
    expect(ul.classList.contains('pl-5')).toBe(true);
    expect(li.classList.contains('whitespace-pre-wrap')).toBe(true);
  });

  it('adds decimal classes to ordered lists', () => {
    if (typeof document === 'undefined') return;

    const root = document.createElement('div');
    const ol = document.createElement('ol');
    const li = document.createElement('li');
    li.textContent = 'first';
    ol.appendChild(li);
    root.appendChild(ol);

    applyEditableListClasses(root);

    expect(ol.classList.contains('list-decimal')).toBe(true);
    expect(ol.classList.contains('pl-5')).toBe(true);
  });
});

describe('buildEditableInlineHtml', () => {
  it('produces non-empty html for note body text', () => {
    const html = buildEditableInlineHtml('You are a **brainstorming** assistant.');
    expect(html).toContain('<strong>brainstorming</strong>');
    expect(html.length).toBeGreaterThan(0);
  });

  it('converts newlines to br tags for multiline blocks', () => {
    expect(buildEditableInlineHtml('line one\nline two')).toBe('line one<br>line two');
  });
});

describe('domInlineToMarkdown', () => {
  const TEXT_NODE = 3;
  const ELEMENT_NODE = 1;

  function mockText(text) {
    return { nodeType: TEXT_NODE, textContent: text };
  }

  function mockElement(tag, childNodes = []) {
    return { nodeType: ELEMENT_NODE, tagName: tag.toUpperCase(), childNodes };
  }

  it('converts formatted inline html back to markdown', () => {
    const root = mockElement('p', [
      mockElement('strong', [mockText('bold')]),
      mockText(' and '),
      mockElement('code', [mockText('code')]),
    ]);
    expect(domInlineToMarkdown(root)).toBe('**bold** and `code`');
  });

  it('matches inlineMarkdownToHtml for simple inline spans', () => {
    const source = 'Use **fresh beans** and `water`.';
    const html = inlineMarkdownToHtml(source);
    const root = mockElement('div', [mockElement('strong', [mockText('fresh beans')])]);
    expect(html).toContain('<strong>fresh beans</strong>');
    expect(domInlineToMarkdown(root)).toBe('**fresh beans**');
  });
});
