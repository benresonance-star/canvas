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
    if (/^\s*(?:[-*]\s+|\d+\.\s+)/.test(line)) break;
    text.push(line.trim());
    index += 1;
  }
  return {
    block: { type: 'paragraph', text: text.join('\n') },
    nextIndex: index,
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
    const match = lines[index].match(matcher);
    if (!match) break;
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

export function parseMarkdownMessage(source) {
  const lines = String(source ?? '').replace(/\r\n/g, '\n').split('\n');
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
  const text = String(source ?? '');
  const segments = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      segments.push({ type: 'text', text: text.slice(cursor, match.index) });
    }
    const token = match[0];
    if (token.startsWith('`')) {
      segments.push({ type: 'code', text: token.slice(1, -1) });
    } else {
      segments.push({ type: 'strong', text: token.slice(2, -2) });
    }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) {
    segments.push({ type: 'text', text: text.slice(cursor) });
  }
  return segments;
}

export function markdownViewToggleLabel(formattedView) {
  return formattedView ? 'Plain text' : 'Formatted';
}
