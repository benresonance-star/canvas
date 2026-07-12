// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { editableDocumentToMarkdown } from '../markdownMessage.js';
import {
  clipboardPayloadToMarkdown,
  insertHorizontalRuleAtRange,
  plainTextLooksLikeMarkdown,
} from '../editableMarkdownDom.js';

function setCaret(node, offset = 0) {
  const selection = document.getSelection();
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return range;
}

describe('editableMarkdownDom', () => {
  let editor;

  beforeEach(() => {
    editor = document.createElement('div');
    editor.innerHTML = '<p class="whitespace-pre-wrap">Before</p>';
    document.body.appendChild(editor);
    const paragraph = editor.querySelector('p');
    setCaret(paragraph.firstChild, paragraph.textContent.length);
  });

  it('inserts multiple horizontal rules as sibling blocks', () => {
    const range = document.getSelection().getRangeAt(0);
    insertHorizontalRuleAtRange(editor, range);
    const paragraph = editor.querySelector('p:last-child');
    setCaret(paragraph.firstChild ?? paragraph, 0);

    insertHorizontalRuleAtRange(editor, document.getSelection().getRangeAt(0));
    setCaret(editor.querySelector('p:last-child'), 0);
    insertHorizontalRuleAtRange(editor, document.getSelection().getRangeAt(0));

    const markdown = editableDocumentToMarkdown(editor);
    expect((markdown.match(/^---$/gm) ?? []).length).toBe(3);
    expect(markdown).toContain('Before');
  });

  it('detects markdown-like clipboard plain text', () => {
    expect(plainTextLooksLikeMarkdown('## Section\n\n**bold**')).toBe(true);
    expect(plainTextLooksLikeMarkdown('hello world')).toBe(false);
  });

  it('converts chatgpt-style html clipboard to markdown', () => {
    const markdown = clipboardPayloadToMarkdown({
      html: [
        '<h2>Section</h2>',
        '<p><strong>Bold</strong> and <em>italic</em></p>',
        '<ul><li>One</li><li>Two</li></ul>',
        '<hr>',
        '<p>After</p>',
      ].join(''),
      plain: '',
    });
    expect(markdown).toContain('## Section');
    expect(markdown).toContain('**Bold**');
    expect(markdown).toContain('*italic*');
    expect(markdown).toContain('- One');
    expect(markdown).toContain('---');
    expect(markdown).toContain('After');
  });

  it('parses chatgpt plain markdown paste payloads', () => {
    const markdown = clipboardPayloadToMarkdown({
      html: '',
      plain: ['# Title', '', 'Some text', '', '---', '', '- item'].join('\n'),
    });
    expect(markdown).toContain('# Title');
    expect(markdown).toContain('---');
    expect(markdown).toContain('- item');
  });
});
