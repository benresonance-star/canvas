function splitTableRow(line) {
  const trimmed = String(line ?? '').trim();
  const withoutEdges = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return withoutEdges.split('|').map((cell) => cell.trim());
}

function isTableSeparator(line) {
  const cells = splitTableRow(line);
  return (
    cells.length > 1
    && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
  );
}

function isTableStart(lines, index) {
  return (
    index + 1 < lines.length
    && lines[index].includes('|')
    && isTableSeparator(lines[index + 1])
    && splitTableRow(lines[index]).length === splitTableRow(lines[index + 1]).length
  );
}

function parseParagraph(lines, start) {
  const text = [];
  let index = start;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) break;
    if (isTableStart(lines, index)) break;
    if (/^\s*(?:#{1,6}\s+|[-*]\s+|\d+\.\s+)/.test(line)) break;
    text.push(line.trim());
    index += 1;
  }
  return {
    block: { type: 'paragraph', text: text.join('\n') },
    nextIndex: index,
  };
}

function parseHeading(line) {
  const match = String(line ?? '').match(/^\s*(#{1,6})\s+(.*)$/);
  if (!match) return null;
  return {
    type: 'heading',
    level: match[1].length,
    text: match[2].trim(),
  };
}

function parseList(lines, start) {
  const ordered = /^\s*\d+\.\s+/.test(lines[start]);
  const items = [];
  let index = start;
  const matcher = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*]\s+(.*)$/;
  const startNumber = ordered
    ? Number(lines[start].match(/^\s*(\d+)\.\s+/)?.[1] ?? 1)
    : undefined;
  while (index < lines.length) {
    const line = lines[index];
    const match = line.match(matcher);
    if (!match) {
      const nestedBullet = line.match(/^\s{2,}[-*]\s+(.*)$/);
      const continuation = line.match(/^\s{2,}(\S.*)$/);
      if (items.length && (nestedBullet || continuation)) {
        items[items.length - 1] += `\n${(nestedBullet?.[1] ?? continuation?.[1] ?? '').trim()}`;
        index += 1;
        continue;
      }
      break;
    }
    items.push(match[1].trim());
    index += 1;
  }
  return {
    block: { type: 'list', ordered, start: startNumber, items },
    nextIndex: index,
  };
}

function parseTable(lines, start) {
  const headers = splitTableRow(lines[start]);
  let index = start + 2;
  const rows = [];
  while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
    const cells = splitTableRow(lines[index]);
    rows.push(headers.map((_, cellIndex) => cells[cellIndex] ?? ''));
    index += 1;
  }
  return {
    block: { type: 'table', headers, rows },
    nextIndex: index,
  };
}

const LATEX_SYMBOL_MAP = {
  rightarrow: '→',
  leftarrow: '←',
  leftrightarrow: '↔',
  Rightarrow: '⇒',
  Leftarrow: '⇐',
  Leftrightarrow: '⇔',
  to: '→',
  gets: '→',
  mapsto: '↦',
  geq: '≥',
  leq: '≤',
  neq: '≠',
  ne: '≠',
  approx: '≈',
  sim: '∼',
  equiv: '≡',
  times: '×',
  cdot: '·',
  infty: '∞',
  pm: '±',
  mp: '∓',
  checkmark: '✓',
  circ: '°',
  degree: '°',
  bullet: '•',
  ell: '…',
  dots: '…',
  ldots: '…',
  cdots: '⋯',
  forall: '∀',
  exists: '∃',
  in: '∈',
  notin: '∉',
  subset: '⊂',
  supset: '⊃',
  cup: '∪',
  cap: '∩',
  wedge: '∧',
  vee: '∨',
  neg: '¬',
  sum: '∑',
  prod: '∏',
  sqrt: '√',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  theta: 'θ',
  lambda: 'λ',
  mu: 'μ',
  pi: 'π',
  sigma: 'σ',
  omega: 'ω',
};

function normalizeLatexCommand(raw) {
  return String(raw ?? '').trim().replace(/^\\+/, '').replace(/[{}]/g, '');
}

export function resolveLatexSymbol(source) {
  const inner = String(source ?? '').trim();
  if (!inner) return null;
  const wrapped = inner.match(/^\$([^$]+)\$$/);
  const body = wrapped ? wrapped[1].trim() : inner;
  const command = normalizeLatexCommand(body);
  if (!command) return null;
  return LATEX_SYMBOL_MAP[command] ?? null;
}

const BARE_LATEX_COMMAND_PATTERN = new RegExp(
  `\\\\(?:${Object.keys(LATEX_SYMBOL_MAP).join('|')})\\b`,
  'g',
);

const DOLLAR_LATEX_PATTERN = /\$([^$\n]+)\$/g;

function repairLatexDelimiters(text) {
  return String(text ?? '')
    .replace(/\$[\r\n]+ightarrow\$/g, '$\\rightarrow$')
    .replace(/\$[\r\n]+leftarrow\$/g, '$\\leftarrow$')
    .replace(/\$[\r\n]+Rightarrow\$/g, '$\\Rightarrow$')
    .replace(/\$[\r\n]+Leftarrow\$/g, '$\\Leftarrow$')
    .replace(/\$[\r\n]+(geq|leq|neq|cdot|times|infty)\$/g, (_, cmd) => `$\\${cmd}$`);
}

function replaceKnownLatex(match) {
  return resolveLatexSymbol(match) ?? match;
}

function replaceLatexInsideText(text) {
  return repairLatexDelimiters(text)
    .replace(DOLLAR_LATEX_PATTERN, replaceKnownLatex)
    .replace(BARE_LATEX_COMMAND_PATTERN, replaceKnownLatex);
}

function replaceInlineLatexChunk(chunk) {
  const parts = String(chunk ?? '').split(/(`[^`]+`)/g);
  return parts.map((part) => {
    if (part.startsWith('`')) {
      const inner = part.slice(1, -1);
      const symbol = resolveLatexSymbol(inner);
      if (symbol) return symbol;
      const processed = replaceLatexInsideText(inner);
      return processed === inner ? part : `\`${processed}\``;
    }
    return replaceLatexInsideText(part);
  }).join('');
}

export function normalizeAgentMarkdownContent(source) {
  const repaired = repairLatexDelimiters(source);
  const parts = repaired.split(/(```[\s\S]*?```)/g);
  return parts.map((part) => (
    part.startsWith('```') ? part : replaceInlineLatexChunk(part)
  )).join('');
}

const LATEX_INLINE_PATTERN = new RegExp(
  `\\$([^$\\n]+)\\$|\\\\(?:${Object.keys(LATEX_SYMBOL_MAP).join('|')})\\b`,
  'g',
);

function pushLatexAwareTextSegment(segments, text) {
  const chunk = String(text ?? '');
  if (!chunk) return;
  LATEX_INLINE_PATTERN.lastIndex = 0;
  let cursor = 0;
  let match;
  while ((match = LATEX_INLINE_PATTERN.exec(chunk)) !== null) {
    if (match.index > cursor) {
      segments.push({ type: 'text', text: chunk.slice(cursor, match.index) });
    }
    const symbol = resolveLatexSymbol(match[0]);
    if (symbol) {
      segments.push({ type: 'symbol', text: symbol, raw: match[0] });
    } else {
      segments.push({ type: 'text', text: match[0] });
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < chunk.length) {
    segments.push({ type: 'text', text: chunk.slice(cursor) });
  }
}

export function parseLatexInlineSegments(text) {
  const segments = [];
  pushLatexAwareTextSegment(segments, text);
  return segments;
}

export function parseMarkdownMessage(source) {
  const lines = normalizeAgentMarkdownContent(source).replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    if (!lines[index].trim()) {
      index += 1;
      continue;
    }
    if (isTableStart(lines, index)) {
      const parsed = parseTable(lines, index);
      blocks.push(parsed.block);
      index = parsed.nextIndex;
      continue;
    }
    const heading = parseHeading(lines[index]);
    if (heading) {
      blocks.push(heading);
      index += 1;
      continue;
    }
    if (/^\s*(?:[-*]\s+|\d+\.\s+)/.test(lines[index])) {
      const parsed = parseList(lines, index);
      blocks.push(parsed.block);
      index = parsed.nextIndex;
      continue;
    }
    const parsed = parseParagraph(lines, index);
    blocks.push(parsed.block);
    index = parsed.nextIndex;
  }
  return blocks;
}

export function parseInlineMarkdown(source) {
  const text = normalizeAgentMarkdownContent(source);
  const segments = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*)/g;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      pushLatexAwareTextSegment(segments, text.slice(cursor, match.index));
    }
    const token = match[0];
    if (token.startsWith('`')) {
      const rawCodeText = token.slice(1, -1);
      const symbol = resolveLatexSymbol(rawCodeText);
      if (symbol) {
        segments.push({ type: 'symbol', text: symbol, raw: rawCodeText });
      } else {
        segments.push({ type: 'code', text: replaceLatexInsideText(rawCodeText) });
      }
    } else if (token.startsWith('**')) {
      segments.push({ type: 'strong', text: token.slice(2, -2) });
    } else {
      segments.push({ type: 'emphasis', text: token.slice(1, -1) });
    }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) {
    pushLatexAwareTextSegment(segments, text.slice(cursor));
  }
  return segments;
}

export function serializeInlineMarkdown(segments) {
  return (segments ?? []).map((segment) => {
    if (segment.type === 'strong') return `**${segment.text}**`;
    if (segment.type === 'emphasis') return `*${segment.text}*`;
    if (segment.type === 'code') return `\`${segment.text}\``;
    if (segment.type === 'symbol') return segment.raw ?? segment.text ?? '';
    return segment.text ?? '';
  }).join('');
}

export function serializeInlineMarkdownText(source) {
  return serializeInlineMarkdown(parseInlineMarkdown(source));
}

function serializeListItemLines(item, prefix) {
  const lines = String(item ?? '').split('\n');
  const first = `${prefix}${lines[0] ?? ''}`;
  if (lines.length <= 1) return first;
  return [first, ...lines.slice(1).map((line) => `   - ${line}`)].join('\n');
}

export function serializeMarkdownBlock(block) {
  if (!block) return '';
  if (block.type === 'paragraph') return block.text ?? '';
  if (block.type === 'heading') {
    const level = Math.min(Math.max(block.level ?? 1, 1), 6);
    return `${'#'.repeat(level)} ${block.text ?? ''}`;
  }
  if (block.type === 'list') {
    const start = block.ordered ? (block.start ?? 1) : 0;
    return (block.items ?? []).map((item, index) => {
      const prefix = block.ordered ? `${start + index}. ` : '- ';
      return serializeListItemLines(item, prefix);
    }).join('\n');
  }
  if (block.type === 'table') {
    const headers = block.headers ?? [];
    const headerRow = `| ${headers.join(' | ')} |`;
    const separator = `| ${headers.map(() => '---').join(' | ')} |`;
    const rows = (block.rows ?? []).map((row) => `| ${row.join(' | ')} |`);
    return [headerRow, separator, ...rows].join('\n');
  }
  return '';
}

export function serializeMarkdownMessage(blocks) {
  return (blocks ?? [])
    .map((block) => serializeMarkdownBlock(block))
    .filter((text) => text.length > 0)
    .join('\n\n')
    .trim();
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function inlineMarkdownToHtml(source) {
  return parseInlineMarkdown(source).map((segment) => {
    if (segment.type === 'strong') return `<strong>${escapeHtml(segment.text)}</strong>`;
    if (segment.type === 'emphasis') return `<em>${escapeHtml(segment.text)}</em>`;
    if (segment.type === 'code') {
      return `<code>${escapeHtml(segment.text)}</code>`;
    }
    if (segment.type === 'symbol') return escapeHtml(segment.text);
    return escapeHtml(segment.text);
  }).join('');
}

/** HTML for contenteditable blocks (newlines become line breaks). */
export function buildEditableInlineHtml(source) {
  return inlineMarkdownToHtml(source).replace(/\n/g, '<br>');
}

function buildListItemEditableHtml(item) {
  const lines = String(item ?? '').split('\n');
  const firstLine = buildEditableInlineHtml(lines[0] ?? '');
  const continuationLines = lines.slice(1);
  if (continuationLines.length === 0) return firstLine;

  const nestedItems = continuationLines.map((line) => {
    const bulletMatch = line.match(/^\s{2,}-\s+(.*)$/);
    const text = bulletMatch ? bulletMatch[1] : line.replace(/^\s{2,}/, '');
    return `<li class="whitespace-pre-wrap">${buildEditableInlineHtml(text)}</li>`;
  }).join('');
  return `${firstLine}<ul class="list-disc space-y-0.5 pl-5">${nestedItems}</ul>`;
}

function buildEditableListHtml(block) {
  const ListTag = block.ordered ? 'ol' : 'ul';
  const listClass = block.ordered ? 'list-decimal' : 'list-disc';
  const startAttr = block.ordered && block.start && block.start !== 1
    ? ` start="${block.start}"`
    : '';
  const items = (block.items ?? []).map((item) => (
    `<li class="whitespace-pre-wrap">${buildListItemEditableHtml(item)}</li>`
  )).join('');
  return `<${ListTag}${startAttr} class="${listClass} space-y-0.5 pl-5">${items}</${ListTag}>`;
}

function buildEditableTableHtml(block) {
  const headers = (block.headers ?? []).map((header) => (
    `<th class="border-b border-border-subtle px-2 py-1 font-semibold text-primary">${buildEditableInlineHtml(header)}</th>`
  )).join('');
  const rows = (block.rows ?? []).map((row) => {
    const cells = row.map((cell) => (
      `<td class="px-2 py-1 align-top">${buildEditableInlineHtml(cell)}</td>`
    )).join('');
    return `<tr class="border-b border-border-subtle/60 last:border-0">${cells}</tr>`;
  }).join('');
  return [
    '<div class="max-w-full overflow-x-auto">',
    '<table class="w-full border-collapse text-left">',
    `<thead><tr>${headers}</tr></thead>`,
    `<tbody>${rows}</tbody>`,
    '</table>',
    '</div>',
  ].join('');
}

function buildEditableBlockHtml(block, compact = false) {
  if (block.type === 'paragraph') {
    const inline = buildEditableInlineHtml(block.text ?? '');
    return `<p class="whitespace-pre-wrap">${inline || '<br>'}</p>`;
  }
  if (block.type === 'heading') {
    const level = Math.min(Math.max(block.level ?? 1, 1), 6);
    const headingClass = compact ? 'text-[11px]' : 'text-sm';
    return `<h${level} class="font-semibold text-primary ${headingClass}">${buildEditableInlineHtml(block.text ?? '')}</h${level}>`;
  }
  if (block.type === 'list') return buildEditableListHtml(block);
  if (block.type === 'table') return buildEditableTableHtml(block);
  return `<p class="whitespace-pre-wrap">${buildEditableInlineHtml(block.text ?? '')}</p>`;
}

/** HTML for a unified contenteditable document surface. */
export function buildEditableDocumentHtml(blocks, { compact = false } = {}) {
  const normalized = (blocks ?? []).length > 0 ? blocks : [{ type: 'paragraph', text: '' }];
  const html = normalized.map((block) => buildEditableBlockHtml(block, compact)).join('');
  return html || '<p class="whitespace-pre-wrap"><br></p>';
}

function domListItemToMarkdown(li) {
  if (!li) return '';
  const TEXT_NODE = 3;
  const ELEMENT_NODE = 1;
  let main = '';
  const continuations = [];

  Array.from(li.childNodes ?? []).forEach((child) => {
    if (child.nodeType === ELEMENT_NODE) {
      const tag = child.tagName?.toLowerCase();
      if (tag === 'ul' || tag === 'ol') {
        Array.from(child.children ?? []).forEach((nestedLi) => {
          if (nestedLi.tagName?.toLowerCase() === 'li') {
            continuations.push(`   - ${domInlineToMarkdown(nestedLi).trim()}`);
          }
        });
        return;
      }
      if (tag === 'p' || tag === 'div') {
        const blockText = domInlineToMarkdown(child).trim();
        if (blockText) {
          main = main ? `${main}\n${blockText}` : blockText;
        }
        return;
      }
    }
    main += domInlineToMarkdown(child);
  });

  const trimmedMain = main.trim();
  if (continuations.length === 0) return trimmedMain;
  return [trimmedMain, ...continuations].join('\n');
}

function domTableToBlock(table) {
  if (!table) return null;
  const headerCells = Array.from(table.querySelectorAll?.('thead tr th, thead tr td') ?? []);
  const headers = headerCells.map((cell) => domInlineToMarkdown(cell).trim());
  const rows = Array.from(table.querySelectorAll?.('tbody tr') ?? []).map((row) => (
    Array.from(row.querySelectorAll?.('td, th') ?? []).map((cell) => domInlineToMarkdown(cell).trim())
  ));
  if (headers.length === 0 && rows.length === 0) return null;
  return { type: 'table', headers, rows };
}

function domListToBlock(node) {
  const ordered = node.tagName?.toLowerCase() === 'ol';
  const start = ordered ? Number(node.getAttribute?.('start') ?? 1) : undefined;
  const items = Array.from(node.children ?? [])
    .filter((child) => child.tagName?.toLowerCase() === 'li')
    .map((li) => domListItemToMarkdown(li));
  return {
    type: 'list',
    ordered,
    ...(ordered ? { start: Number.isFinite(start) && start > 0 ? start : 1 } : {}),
    items: items.length > 0 ? items : [''],
  };
}

function domParagraphToBlock(node) {
  return { type: 'paragraph', text: domInlineToMarkdown(node).trim() };
}

function isListElement(node) {
  if (!node || node.nodeType !== 1) return false;
  const tag = node.tagName?.toLowerCase();
  return tag === 'ul' || tag === 'ol';
}

function isBlockContainerElement(node) {
  if (!node || node.nodeType !== 1) return false;
  const tag = node.tagName?.toLowerCase();
  return tag === 'p' || tag === 'div';
}

/** Split a paragraph/div that still contains lists into separate markdown blocks. */
export function splitMixedBlockNode(node) {
  if (!isBlockContainerElement(node)) {
    const block = domNodeToBlock(node);
    return block ? [block] : [];
  }

  const lists = Array.from(node.children ?? []).filter(isListElement);
  if (lists.length === 0) {
    const paragraph = domParagraphToBlock(node);
    return paragraph.text || node.querySelector?.('br') ? [paragraph] : [];
  }

  const blocks = [];
  const beforeParts = [];
  for (const child of Array.from(node.childNodes ?? [])) {
    if (isListElement(child)) break;
    beforeParts.push(domInlineToMarkdown(child));
  }
  const beforeText = beforeParts.join('').trim();
  if (beforeText) blocks.push({ type: 'paragraph', text: beforeText });
  lists.forEach((list) => {
    blocks.push(domListToBlock(list));
  });
  return blocks;
}

function hoistListsFromContainers(root) {
  if (!root?.querySelectorAll) return;
  const containers = Array.from(root.querySelectorAll('p, div')).filter((container) => (
    Array.from(container.children ?? []).some(isListElement)
  ));

  containers.forEach((container) => {
    const parent = container.parentNode;
    if (!parent) return;

    let child = container.firstChild;
    while (child) {
      const next = child.nextSibling;
      if (isListElement(child)) {
        parent.insertBefore(child, container.nextSibling);
      }
      child = next;
    }

    if (
      !container.textContent?.trim()
      && !container.querySelector?.('br')
      && container.children.length === 0
    ) {
      container.remove();
    }
  });
}

function normalizeListItems(root) {
  if (!root?.querySelectorAll) return;
  const items = Array.from(root.querySelectorAll('li'));
  items.forEach((li) => {
    const blockChildren = Array.from(li.children ?? []).filter((child) => {
      const tag = child.tagName?.toLowerCase();
      return tag === 'p' || tag === 'div';
    });
    if (blockChildren.length === 0) return;

    if (blockChildren.length === 1 && li.children.length === 1) {
      const block = blockChildren[0];
      while (block.firstChild) li.insertBefore(block.firstChild, block);
      block.remove();
      return;
    }

    const parent = li.parentNode;
    if (!parent) return;
    const fragment = document.createDocumentFragment();

    const leadingLi = document.createElement('li');
    leadingLi.className = li.className;
    let child = li.firstChild;
    while (child && !blockChildren.includes(child)) {
      const next = child.nextSibling;
      leadingLi.appendChild(child);
      child = next;
    }
    if (leadingLi.hasChildNodes()) fragment.appendChild(leadingLi);

    blockChildren.forEach((block) => {
      const newLi = document.createElement('li');
      newLi.className = li.className;
      while (block.firstChild) newLi.appendChild(block.firstChild);
      block.remove();
      if (!newLi.hasChildNodes()) newLi.appendChild(document.createElement('br'));
      fragment.appendChild(newLi);
    });

    parent.insertBefore(fragment, li);
    li.remove();
  });
}

function mergeAdjacentListsAtLevel(parent) {
  if (!parent?.childNodes) return;
  const children = Array.from(parent.childNodes);
  for (let index = 0; index < children.length - 1; index += 1) {
    const current = children[index];
    const next = children[index + 1];
    if (!isListElement(current) || !isListElement(next)) continue;
    if (current.tagName !== next.tagName) continue;
    while (next.firstChild) current.appendChild(next.firstChild);
    next.remove();
    children.splice(index + 1, 1);
    index -= 1;
  }
}

function mergeAdjacentListsDeep(root) {
  if (!root?.querySelectorAll) return;
  mergeAdjacentListsAtLevel(root);
  root.querySelectorAll('p, div, li').forEach((node) => mergeAdjacentListsAtLevel(node));
}

const EDITABLE_UL_CLASSES = ['list-disc', 'space-y-0.5', 'pl-5'];
const EDITABLE_OL_CLASSES = ['list-decimal', 'space-y-0.5', 'pl-5'];
const EDITABLE_LI_CLASSES = ['whitespace-pre-wrap'];

function addMissingClasses(element, classNames) {
  classNames.forEach((className) => {
    if (!element.classList.contains(className)) {
      element.classList.add(className);
    }
  });
}

/** Ensure execCommand-created lists match buildEditableDocumentHtml styling. */
export function applyEditableListClasses(root) {
  if (!root?.querySelectorAll) return root;
  root.querySelectorAll('ul').forEach((ul) => addMissingClasses(ul, EDITABLE_UL_CLASSES));
  root.querySelectorAll('ol').forEach((ol) => addMissingClasses(ol, EDITABLE_OL_CLASSES));
  root.querySelectorAll('li').forEach((li) => addMissingClasses(li, EDITABLE_LI_CLASSES));
  return root;
}

/** In-place cleanup of browser contenteditable list/paragraph nesting before serialize. */
export function normalizeEditableDocumentDom(root) {
  if (!root || typeof document === 'undefined') return root;
  for (let pass = 0; pass < 5; pass += 1) {
    const before = root.innerHTML ?? '';
    hoistListsFromContainers(root);
    normalizeListItems(root);
    mergeAdjacentListsDeep(root);
    const after = root.innerHTML ?? '';
    if (after === before) break;
  }
  applyEditableListClasses(root);
  return root;
}

function domHeadingToBlock(node) {
  const level = Number(node.tagName?.[1] ?? 1);
  return {
    type: 'heading',
    level: Number.isFinite(level) ? level : 1,
    text: domInlineToMarkdown(node).trim(),
  };
}

function domNodeToBlock(node) {
  if (!node) return null;
  const TEXT_NODE = 3;
  const ELEMENT_NODE = 1;
  if (node.nodeType === TEXT_NODE) {
    const text = (node.textContent ?? '').trim();
    return text ? { type: 'paragraph', text } : null;
  }
  if (node.nodeType !== ELEMENT_NODE) return null;

  const tag = node.tagName?.toLowerCase();
  if (tag === 'div') {
    const childTable = Array.from(node.children ?? []).find(
      (child) => child.tagName?.toLowerCase() === 'table',
    );
    if (childTable) return domTableToBlock(childTable);
    return domParagraphToBlock(node);
  }
  if (tag === 'p') return domParagraphToBlock(node);
  if (/^h[1-6]$/.test(tag ?? '')) return domHeadingToBlock(node);
  if (tag === 'ul' || tag === 'ol') return domListToBlock(node);
  if (tag === 'table') return domTableToBlock(node);
  if (tag === 'br') return null;
  return domParagraphToBlock(node);
}

function getTopLevelBlockNodes(root) {
  if (!root) return [];
  const TEXT_NODE = 3;
  const ELEMENT_NODE = 1;
  return Array.from(root.childNodes ?? []).filter((node) => {
    if (node.nodeType === TEXT_NODE) return (node.textContent ?? '').trim().length > 0;
    if (node.nodeType === ELEMENT_NODE) return node.tagName?.toLowerCase() !== 'br';
    return false;
  });
}

function mergeAdjacentListBlocks(blocks) {
  const merged = [];
  blocks.forEach((block) => {
    const previous = merged[merged.length - 1];
    if (
      block?.type === 'list'
      && previous?.type === 'list'
      && block.ordered === previous.ordered
    ) {
      merged[merged.length - 1] = {
        ...previous,
        items: [...(previous.items ?? []), ...(block.items ?? [])],
      };
      return;
    }
    merged.push(block);
  });
  return merged;
}

/** Parse a unified contenteditable document back into markdown blocks. */
export function editableDocumentToBlocks(root) {
  normalizeEditableDocumentDom(root);
  const blocks = [];
  getTopLevelBlockNodes(root).forEach((node) => {
    if (isBlockContainerElement(node) && Array.from(node.children ?? []).some(isListElement)) {
      blocks.push(...splitMixedBlockNode(node));
      return;
    }
    const block = domNodeToBlock(node);
    if (block) blocks.push(block);
  });
  return mergeAdjacentListBlocks(blocks);
}

/** Parse a unified contenteditable document back into markdown text. */
export function editableDocumentToMarkdown(root) {
  return serializeMarkdownMessage(editableDocumentToBlocks(root));
}

export function domInlineToMarkdown(root) {
  if (!root) return '';
  const TEXT_NODE = 3;
  const ELEMENT_NODE = 1;

  const walkInline = (node) => {
    if (!node) return '';
    if (node.nodeType === TEXT_NODE) return node.textContent ?? '';
    if (node.nodeType !== ELEMENT_NODE) return '';
    const tag = node.tagName?.toLowerCase();
    if (tag === 'br') return '\n';
    if (tag === 'ul' || tag === 'ol' || tag === 'li') return '';
    const childText = Array.from(node.childNodes).map(walkInline).join('');
    if (tag === 'strong' || tag === 'b') return `**${childText}**`;
    if (tag === 'em' || tag === 'i') return `*${childText}*`;
    if (tag === 'code') return `\`${childText}\``;
    return childText;
  };

  if (root.nodeType === TEXT_NODE) return root.textContent ?? '';
  if (root.nodeType === ELEMENT_NODE) {
    const tag = root.tagName?.toLowerCase();
    const childText = Array.from(root.childNodes).map(walkInline).join('');
    if (tag === 'strong' || tag === 'b') return `**${childText}**`;
    if (tag === 'em' || tag === 'i') return `*${childText}*`;
    if (tag === 'code') return `\`${childText}\``;
    if (tag === 'p' || tag === 'div' || /^h[1-6]$/.test(tag ?? '') || tag === 'li' || tag === 'td' || tag === 'th') {
      return childText;
    }
    return childText;
  }
  return '';
}

export function resolveMarkdownCopyText(selectedText, content) {
  const selected = String(selectedText ?? '').trim();
  const full = String(content ?? '').trim();
  if (!selected) return null;
  if (selected !== full) return null;
  return full;
}

export function markdownViewToggleLabel(formattedView) {
  return formattedView ? 'Plain text' : 'Formatted';
}

/** Convert a paragraph block into a list block (splits on newlines). */
export function paragraphToListBlock(paragraph, ordered) {
  const text = String(paragraph?.text ?? '');
  const lines = text.length > 0 ? text.split('\n') : [''];
  return {
    type: 'list',
    ordered: Boolean(ordered),
    ...(ordered ? { start: 1 } : {}),
    items: lines,
  };
}

/** Toggle ordered vs bullet on an existing list block. */
export function setListBlockOrdered(listBlock, ordered) {
  const nextOrdered = Boolean(ordered);
  return {
    ...listBlock,
    type: 'list',
    ordered: nextOrdered,
    start: nextOrdered ? (listBlock.start ?? 1) : undefined,
  };
}
