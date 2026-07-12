import {
  buildEditableDocumentHtml,
  editableDocumentToMarkdown,
  normalizeEditableDocumentDom,
  parseMarkdownMessage,
  serializeMarkdownMessage,
} from './markdownMessage.js';

const EDITABLE_BLOCK_SELECTOR = 'p, div, h1, h2, h3, h4, h5, h6';
const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';

function meaningfulDomChildren(node) {
  return Array.from(node?.childNodes ?? []).filter((child) => {
    if (child.nodeType === 3) return (child.textContent ?? '').trim().length > 0;
    if (child.nodeType === 1) return child.tagName?.toLowerCase() !== 'br';
    return false;
  });
}

export function headingClassForLevel(level, compact = false) {
  const normalized = Math.min(Math.max(level, 1), 6);
  if (normalized === 1) {
    return `font-semibold text-primary ${compact ? 'text-[12px]' : 'text-base'}`;
  }
  if (normalized === 2) {
    return `font-semibold text-primary ${compact ? 'text-[11px]' : 'text-sm'}`;
  }
  return `font-semibold text-primary ${compact ? 'text-[11px]' : 'text-sm'}`;
}

export function findEditableBlock(node, editor) {
  if (!node || !editor) return null;
  let current = node;
  if (current.nodeType === 3) current = current.parentElement;
  const block = current?.closest?.(EDITABLE_BLOCK_SELECTOR);
  if (!block || !editor.contains(block)) return editor;
  return block;
}

function createEmptyParagraph(className = 'whitespace-pre-wrap') {
  const paragraph = document.createElement('p');
  paragraph.className = className;
  paragraph.appendChild(document.createElement('br'));
  return paragraph;
}

function ensurePlaceholder(block) {
  if (!meaningfulDomChildren(block).length && !block.querySelector?.('br')) {
    block.appendChild(document.createElement('br'));
  }
}

function createHorizontalRuleElement() {
  const hr = document.createElement('hr');
  hr.setAttribute('contenteditable', 'false');
  return hr;
}

function placeCaretInBlock(block) {
  const selection = document.getSelection?.();
  if (!selection || !block) return;
  const range = document.createRange();
  range.selectNodeContents(block);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function blockHasContent(block) {
  return meaningfulDomChildren(block).length > 0;
}

function splitBlockAtRange(block, range) {
  const tailRange = document.createRange();
  tailRange.setStart(range.endContainer, range.endOffset);
  tailRange.setEnd(block, block.childNodes.length);
  const tail = tailRange.extractContents();

  const headRange = document.createRange();
  headRange.setStart(block, 0);
  headRange.setEnd(range.startContainer, range.startOffset);
  const headFragment = headRange.extractContents();
  while (block.firstChild) block.removeChild(block.firstChild);
  if (headFragment.childNodes.length) block.appendChild(headFragment);

  const afterBlock = block.tagName?.toLowerCase()?.startsWith('h')
    ? createEmptyParagraph()
    : block.cloneNode(false);
  if (!afterBlock.className) afterBlock.className = block.className || 'whitespace-pre-wrap';
  if (tail.childNodes.length) afterBlock.appendChild(tail);
  else ensurePlaceholder(afterBlock);

  return {
    beforeBlock: block,
    afterBlock,
    beforeEmpty: !blockHasContent(block),
  };
}

function insertSiblingBlocks(parent, insertBefore, nodes) {
  nodes.forEach((node) => parent.insertBefore(node, insertBefore));
}

/** Insert a horizontal rule as a top-level block (never nested inside a paragraph). */
export function insertHorizontalRuleAtRange(editor, range) {
  if (!editor || !range || typeof document === 'undefined') return null;

  const hr = createHorizontalRuleElement();
  const block = findEditableBlock(range.commonAncestorContainer, editor);

  if (!block || block === editor) {
    range.deleteContents();
    const afterBlock = createEmptyParagraph();
    const parent = editor;
    const insertBefore = range.endContainer === editor
      ? range.endContainer.childNodes[range.endOffset] ?? null
      : null;
    if (insertBefore) {
      parent.insertBefore(hr, insertBefore);
      parent.insertBefore(afterBlock, insertBefore);
    } else {
      parent.appendChild(hr);
      parent.appendChild(afterBlock);
    }
    placeCaretInBlock(afterBlock);
    return afterBlock;
  }

  const parent = block.parentNode;
  if (!parent) return null;

  const { afterBlock, beforeEmpty } = splitBlockAtRange(block, range);
  parent.insertBefore(afterBlock, block.nextSibling);
  parent.insertBefore(hr, afterBlock);
  if (beforeEmpty) parent.removeChild(block);
  placeCaretInBlock(afterBlock);
  return afterBlock;
}

export function applyHeadingToRange(editor, range, level, { compact = false } = {}) {
  if (!editor || !range || typeof document === 'undefined') return null;
  const block = findEditableBlock(range.commonAncestorContainer, editor);
  if (!block || block === editor) return null;

  const currentTag = block.tagName?.toLowerCase() ?? 'p';
  const targetTag = `h${Math.min(Math.max(level, 1), 2)}`;

  if (currentTag === targetTag) {
    const paragraph = document.createElement('p');
    paragraph.className = 'whitespace-pre-wrap';
    while (block.firstChild) paragraph.appendChild(block.firstChild);
    ensurePlaceholder(paragraph);
    block.parentNode?.replaceChild(paragraph, block);
    return paragraph;
  }

  const heading = document.createElement(targetTag);
  heading.className = headingClassForLevel(level, compact);
  while (block.firstChild) heading.appendChild(block.firstChild);
  if (!meaningfulDomChildren(heading).length) {
    heading.appendChild(document.createElement('br'));
  }
  block.parentNode?.replaceChild(heading, block);
  return heading;
}

export function resolveHeadingLevelInEditor(editor, selection) {
  if (!editor || !selection?.rangeCount) return null;
  let node = selection.anchorNode;
  if (node?.nodeType === 3) node = node.parentElement;
  const heading = node?.closest?.(HEADING_SELECTOR);
  if (!heading || !editor.contains(heading)) return null;
  const level = Number(heading.tagName?.[1] ?? 0);
  return level === 1 || level === 2 ? level : null;
}

function looksLikeMarkdown(text) {
  return /(^|\n)(#{1,6}\s+|[-*]\s+|\d+\.\s+|---\s*$|\*\*|__|\*.+\*)/m.test(String(text ?? ''));
}

export function plainTextLooksLikeMarkdown(text) {
  return looksLikeMarkdown(text);
}

function sanitizeClipboardHtml(html) {
  return String(html ?? '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<meta[^>]*>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '');
}

function normalizeClipboardHtml(root, { compact = false } = {}) {
  if (!root?.querySelectorAll) return root;

  root.querySelectorAll('b').forEach((node) => {
    const strong = document.createElement('strong');
    while (node.firstChild) strong.appendChild(node.firstChild);
    node.parentNode?.replaceChild(strong, node);
  });

  root.querySelectorAll('i').forEach((node) => {
    const emphasis = document.createElement('em');
    while (node.firstChild) emphasis.appendChild(node.firstChild);
    node.parentNode?.replaceChild(emphasis, node);
  });

  root.querySelectorAll('span').forEach((node) => {
    const style = String(node.getAttribute?.('style') ?? '').toLowerCase();
    const isBold = /font-weight\s*:\s*(bold|[6-9]00)/.test(style);
    const isItalic = /font-style\s*:\s*italic/.test(style);
    if (!isBold && !isItalic) return;
    const wrapper = document.createElement(isBold ? 'strong' : 'em');
    while (node.firstChild) wrapper.appendChild(node.firstChild);
    node.parentNode?.replaceChild(wrapper, node);
  });

  root.querySelectorAll('h3,h4,h5,h6').forEach((node) => {
    const heading = document.createElement('h2');
    heading.className = headingClassForLevel(2, compact);
    while (node.firstChild) heading.appendChild(node.firstChild);
    node.parentNode?.replaceChild(heading, node);
  });

  root.querySelectorAll('h1,h2').forEach((node) => {
    const level = Number(node.tagName?.[1] ?? 2);
    node.className = headingClassForLevel(level, compact);
  });

  let changed = true;
  while (changed) {
    changed = false;
    root.querySelectorAll('div').forEach((node) => {
      if (node === root) return;
      const onlyBlocks = meaningfulDomChildren(node).every((child) => (
        child.nodeType === 1
        && !['div', 'span'].includes(child.tagName?.toLowerCase())
      ));
      if (!onlyBlocks) return;
      const parent = node.parentNode;
      if (!parent) return;
      while (node.firstChild) parent.insertBefore(node.firstChild, node);
      node.remove();
      changed = true;
    });
  }

  return root;
}

export function htmlClipboardToMarkdown(html, { compact = false } = {}) {
  if (!html?.trim() || typeof document === 'undefined') return null;
  const root = document.createElement('div');
  root.innerHTML = sanitizeClipboardHtml(html);
  normalizeClipboardHtml(root, { compact });
  normalizeEditableDocumentDom(root);
  const markdown = editableDocumentToMarkdown(root).trim();
  return markdown || null;
}

export function clipboardPayloadToMarkdown({ html = '', plain = '' } = {}, options = {}) {
  const fromHtml = html?.trim() ? htmlClipboardToMarkdown(html, options) : null;
  if (fromHtml) return fromHtml;

  const text = String(plain ?? '');
  if (!text.trim()) return text;
  if (looksLikeMarkdown(text)) {
    return serializeMarkdownMessage(parseMarkdownMessage(text));
  }
  return text;
}

export function insertMarkdownAtRange(editor, range, markdown, { compact = false } = {}) {
  if (!editor || !range || typeof document === 'undefined') return null;

  const blocks = parseMarkdownMessage(markdown);
  const html = buildEditableDocumentHtml(blocks, { compact });
  const host = document.createElement('div');
  host.innerHTML = html;
  normalizeEditableDocumentDom(host);
  const nodes = Array.from(host.childNodes).map((node) => node.cloneNode(true));
  if (!nodes.length) return null;

  const block = findEditableBlock(range.commonAncestorContainer, editor);
  if (!block || block === editor) {
    range.deleteContents();
    const fragment = document.createDocumentFragment();
    nodes.forEach((node) => fragment.appendChild(node));
    range.insertNode(fragment);
    const last = nodes[nodes.length - 1];
    if (last) placeCaretInBlock(last.nodeType === 1 ? last : createEmptyParagraph());
    return last;
  }

  const parent = block.parentNode;
  if (!parent) return null;

  const { afterBlock, beforeEmpty } = splitBlockAtRange(block, range);
  parent.insertBefore(afterBlock, block.nextSibling);
  nodes.forEach((node) => parent.insertBefore(node, afterBlock));
  if (beforeEmpty) parent.removeChild(block);
  placeCaretInBlock(afterBlock);
  return afterBlock;
}
